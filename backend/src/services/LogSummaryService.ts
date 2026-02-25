import { LogModel, LogRecord } from '../models/Log';

const ERROR_PATTERN = /\b(ERROR|FATAL)\b/i;
const WARN_PATTERN = /\b(WARN|WARNING)\b/i;
const INFO_PATTERN = /\b(INFO|DEBUG)\b/i;

const IP_PATTERN = /\b(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\b/g;
const ERROR_CODE_PATTERN = /\b(E\d{3,5}|ERR[-_]\d+|0x[0-9A-Fa-f]{4,})\b/g;
const DEVICE_ID_PATTERN = /\b(DEV[-_][A-Za-z0-9]+|[A-Fa-f0-9]{8}-[A-Fa-f0-9]{4})\b/g;

const ISO_TIMESTAMP = /\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}/;
const SYSLOG_TIMESTAMP = /[A-Z][a-z]{2}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2}/;

export interface LogAISummary {
  lineCount: number;
  errorCount: number;
  warnCount: number;
  infoCount: number;
  errorRate: number;
  topErrors: string[];
  topWarnings: string[];
  keywords: string[];
  timespan?: { first: string; last: string };
  oneLiner: string;
}

export class LogSummaryService {
  private logModel: LogModel;

  constructor(logModel: LogModel) {
    this.logModel = logModel;
  }

  summarize(logRecord: LogRecord): LogAISummary {
    const lines = (logRecord.raw_data || '').split('\n');
    const nonEmptyLines = lines.filter(l => l.trim());
    const lineCount = nonEmptyLines.length;

    let errorCount = 0;
    let warnCount = 0;
    let infoCount = 0;
    const errorMessages: Map<string, number> = new Map();
    const warnMessages: Map<string, number> = new Map();
    const keywordsSet = new Set<string>();
    const timestamps: string[] = [];

    for (const line of nonEmptyLines) {
      if (ERROR_PATTERN.test(line)) {
        errorCount++;
        const msg = this.extractMessage(line, ERROR_PATTERN);
        errorMessages.set(msg, (errorMessages.get(msg) || 0) + 1);
      } else if (WARN_PATTERN.test(line)) {
        warnCount++;
        const msg = this.extractMessage(line, WARN_PATTERN);
        warnMessages.set(msg, (warnMessages.get(msg) || 0) + 1);
      } else {
        infoCount++;
      }

      // Extract keywords
      const ips = line.match(IP_PATTERN);
      if (ips) ips.forEach(ip => keywordsSet.add(ip));

      const errorCodes = line.match(ERROR_CODE_PATTERN);
      if (errorCodes) errorCodes.forEach(code => keywordsSet.add(code));

      const deviceIds = line.match(DEVICE_ID_PATTERN);
      if (deviceIds) deviceIds.forEach(did => keywordsSet.add(did));

      // Extract timestamps
      const isoMatch = line.match(ISO_TIMESTAMP);
      if (isoMatch) timestamps.push(isoMatch[0]);
      else {
        const syslogMatch = line.match(SYSLOG_TIMESTAMP);
        if (syslogMatch) timestamps.push(syslogMatch[0]);
      }
    }

    const errorRate = lineCount > 0 ? errorCount / lineCount : 0;

    const topErrors = this.topN(errorMessages, 3);
    const topWarnings = this.topN(warnMessages, 3);
    const keywords = Array.from(keywordsSet).slice(0, 10);

    let timespan: { first: string; last: string } | undefined;
    if (timestamps.length >= 2) {
      timespan = { first: timestamps[0], last: timestamps[timestamps.length - 1] };
    }

    const oneLiner = this.generateOneLiner(lineCount, errorCount, warnCount, errorRate, topErrors, timespan);

    return {
      lineCount,
      errorCount,
      warnCount,
      infoCount,
      errorRate: Math.round(errorRate * 1000) / 1000,
      topErrors,
      topWarnings,
      keywords,
      timespan,
      oneLiner,
    };
  }

  summarizeAndStore(logId: string): LogAISummary | undefined {
    const log = this.logModel.getById(logId);
    if (!log) return undefined;

    const summary = this.summarize(log);

    let metadata: Record<string, any> = {};
    try {
      metadata = JSON.parse(log.metadata || '{}');
    } catch {}

    metadata.ai_summary = summary;

    // Update log metadata with the summary
    const stmt = (this.logModel as any).db.prepare(
      'UPDATE logs SET metadata = ? WHERE id = ?'
    );
    stmt.run(JSON.stringify(metadata), logId);

    return summary;
  }

  getSummary(logId: string): LogAISummary | undefined {
    const log = this.logModel.getById(logId);
    if (!log) return undefined;

    try {
      const metadata = JSON.parse(log.metadata || '{}');
      return metadata.ai_summary || undefined;
    } catch {
      return undefined;
    }
  }

  private extractMessage(line: string, pattern: RegExp): string {
    const match = line.match(pattern);
    if (!match) return line.substring(0, 100);
    const afterKeyword = line.substring(match.index! + match[0].length).trim();
    // Remove leading colons, brackets, etc.
    const cleaned = afterKeyword.replace(/^[:\]\s-]+/, '').trim();
    return cleaned.substring(0, 100) || line.substring(0, 100);
  }

  private topN(map: Map<string, number>, n: number): string[] {
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([msg]) => msg);
  }

  private generateOneLiner(
    lineCount: number,
    errorCount: number,
    warnCount: number,
    errorRate: number,
    topErrors: string[],
    timespan?: { first: string; last: string },
  ): string {
    const parts: string[] = [];
    parts.push(`${lineCount} lines`);

    if (errorCount > 0) {
      parts.push(`${errorCount} errors (${(errorRate * 100).toFixed(1)}%)`);
    }
    if (warnCount > 0) {
      parts.push(`${warnCount} warnings`);
    }

    if (timespan) {
      const span = this.computeTimespan(timespan.first, timespan.last);
      if (span) parts.push(`spanning ${span}`);
    }

    let oneLiner = parts.join(', ');

    if (topErrors.length > 0) {
      oneLiner += `. Top error: ${topErrors[0].substring(0, 60)}`;
    }

    if (errorCount === 0 && warnCount === 0) {
      oneLiner += '. No errors or warnings detected';
    }

    return oneLiner;
  }

  private computeTimespan(first: string, last: string): string | undefined {
    try {
      const start = new Date(first);
      const end = new Date(last);
      if (isNaN(start.getTime()) || isNaN(end.getTime())) return undefined;

      const diffMs = end.getTime() - start.getTime();
      if (diffMs <= 0) return undefined;

      const hours = Math.floor(diffMs / (1000 * 60 * 60));
      const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

      if (hours > 0) return `${hours}h ${minutes}m`;
      if (minutes > 0) return `${minutes}m`;
      return `${Math.round(diffMs / 1000)}s`;
    } catch {
      return undefined;
    }
  }
}
