import type { Metadata } from 'next';
import { SiteMetaProvider } from '@/components/SiteMetaProvider';
import './globals.css';

export const metadata: Metadata = {
  title: 'AI Server Platform - 智能服务器选购',
  description: '通过 AI 智能推荐或价格表筛选，找到适合业务的服务器配置',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">
        <SiteMetaProvider>{children}</SiteMetaProvider>
      </body>
    </html>
  );
}
