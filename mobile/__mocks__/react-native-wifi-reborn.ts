export default {
  loadWifiList: jest.fn().mockResolvedValue([]),
  connectToProtectedSSID: jest.fn().mockResolvedValue(undefined),
  disconnect: jest.fn().mockResolvedValue(undefined),
  getCurrentWifiSSID: jest.fn().mockResolvedValue(''),
};
