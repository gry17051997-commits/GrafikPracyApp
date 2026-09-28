import React from 'react';
import {registerRootComponent} from 'expo';
import * as Notifications from 'expo-notifications';
import './LocationService';
import App from './App';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false
  })
});

registerRootComponent(App);
