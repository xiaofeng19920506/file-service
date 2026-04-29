import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { getPublicSiteOrigin } from "@/lib/site-url";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const siteOrigin = getPublicSiteOrigin();

const defaultTitle = "文件服务｜分片上传、整文件上传与私有存储";
const defaultDescription =
  "面向团队与内网的轻量文件服务：支持整文件上传、分片上传合并、列表与下载；基于连接身份隔离数据，无需账号登录。适合 ZeroTier 等虚拟网络场景部署。";

export const metadata: Metadata = {
  ...(siteOrigin ? { metadataBase: new URL(siteOrigin) } : {}),
  title: {
    default: defaultTitle,
    template: "%s｜文件服务",
  },
  description: defaultDescription,
  applicationName: "文件服务",
  keywords: [
    "文件上传",
    "分片上传",
    "大文件合并",
    "私有文件服务",
    "ZeroTier",
    "内网文件",
    "Next.js",
  ],
  authors: [{ name: "文件服务" }],
  creator: "文件服务",
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true },
  },
  alternates: siteOrigin
    ? { canonical: `${siteOrigin}/` }
    : undefined,
  openGraph: {
    type: "website",
    locale: "zh_CN",
    siteName: "文件服务",
    title: defaultTitle,
    description: defaultDescription,
    ...(siteOrigin ? { url: `${siteOrigin}/` } : {}),
  },
  twitter: {
    card: "summary_large_image",
    title: defaultTitle,
    description: defaultDescription,
  },
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
};

export const viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafafa" },
    { media: "(prefers-color-scheme: dark)", color: "#09090b" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-CN"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
