import { registerRootComponent } from 'expo';
import App from './App';

registerRootComponent(App);

if (typeof require === 'function') {
  try {
    const { registerWidgetTaskHandler } = require('react-native-android-widget');
    const { widgetTaskHandler } = require('./widget-task-handler');
    registerWidgetTaskHandler(widgetTaskHandler);
  } catch (e) {}
}
