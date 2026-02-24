import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { AppNavigator } from './src/screens/AppNavigator';

export default function App() {
  return (
    <>
      <AppNavigator />
      <StatusBar style="dark" />
    </>
  );
}
