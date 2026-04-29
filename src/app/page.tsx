import type { Metadata } from "next";
import HomeClient from "./home-client";
import { getPublicSiteOrigin } from "@/lib/site-url";

const pageDescription =
  "在浏览器中完成整文件或分片上传、合并与下载；每个访问者仅能看到并管理自己的文件，适合部署在 ZeroTier 等仅成员可达的网络。";

export const metadata: Metadata = {
  description: pageDescription,
  openGraph: {
    description: pageDescription,
  },
};

function homeJsonLd() {
  const origin = getPublicSiteOrigin();
  if (!origin) return null;
  const payload = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "文件服务",
    description: pageDescription,
    url: `${origin}/`,
    inLanguage: "zh-CN",
  };
  return (
    <script
      type="application/ld+json"
      // JSON-LD 为服务端固定结构，无用户输入
      dangerouslySetInnerHTML={{ __html: JSON.stringify(payload) }}
    />
  );
}

export default function Home() {
  return (
    <>
      {homeJsonLd()}
      <HomeClient />
    </>
  );
}
