import type { Metadata } from 'next';
import './globals.css';
import { ThemeProvider } from './providers';
import { SettingsProvider } from './settings-provider';
import { AgentsProvider } from './agents-provider';
import { GatewayProvider } from '@/components/GatewayProvider';
import { ChatManagerProvider } from '@/components/ChatManagerProvider';
import { Sidebar } from '@/components/Sidebar';
import { DynamicFavicon } from '@/components/DynamicFavicon';
import { OnboardingWizard } from '@/components/OnboardingWizard';
import { LiveStreamWidget } from '@/components/LiveStreamWidget';
import { AgentsSlotProvider } from '@/components/AgentsSlotContext';

export const metadata: Metadata = {
  title: 'ClawPort -- Command Centre',
  description: 'AI Agent Management Dashboard',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <body>
        <ThemeProvider>
          <SettingsProvider>
            <GatewayProvider>
              <ChatManagerProvider>
                <AgentsProvider>
                  <AgentsSlotProvider>
                    <DynamicFavicon />
                    <OnboardingWizard />
                    <LiveStreamWidget />
                    <div
                      className="flex h-screen overflow-hidden"
                      style={{ background: 'var(--bg)' }}
                    >
                      {/* Client-side shell handles both desktop sidebar + mobile */}
                      <Sidebar />

                      {/* Main content */}
                      <main className="flex-1 overflow-hidden relative">
                        {/* Mobile spacer for fixed header */}
                        <div className="md:hidden" style={{ height: '48px', flexShrink: 0 }} />
                        {children}
                      </main>
                    </div>
                  </AgentsSlotProvider>
                </AgentsProvider>
              </ChatManagerProvider>
            </GatewayProvider>
          </SettingsProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
