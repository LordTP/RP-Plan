import type { Metadata } from 'next';
import { Toaster } from 'react-hot-toast';
import './globals.css';

export const metadata: Metadata = {
  title: 'Critical Path',
  description: 'Critical Path Management System',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        {children}
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 4000,
            success: {
              className: 'toast-success',
            },
            error: {
              className: 'toast-error',
            },
          }}
        />
      </body>
    </html>
  );
}
