import { Redirect } from 'expo-router';

/**
 * MESSAGES IS RETIRED (founder call, 21 Sep): it showed the same campaign
 * messages the Notifications panel already carries, so the app has one place
 * to read what we sent. The route stays as a redirect so an old link or a
 * notification that still points here lands on Notifications instead of a
 * dead screen.
 */
export default function Inbox() {
  return <Redirect href="/notifications" />;
}
