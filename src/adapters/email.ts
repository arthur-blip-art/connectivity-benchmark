import type { Delivery } from './types';

// Simulated in V1: the message is stored and shown in the internal view instead of being sent.
export async function sendReportEmail(to: string, reportUrl: string): Promise<Delivery> {
  return {
    mode: 'mock',
    payload: {
      to,
      subject: 'Your connectivity benchmark report',
      body: `Here is your report: ${reportUrl}\nEvery connection in it links to its public source. Reply to this email to correct anything.`,
    },
  };
}
