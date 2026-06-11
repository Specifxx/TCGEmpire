import { ProxyBuilder } from "@/components/ProxyBuilder";

export const metadata = {
  title: "Proxy Printer — Pick Cards to Print",
  robots: { index: false },
};

export default function ProxyPage({ searchParams }: { searchParams: { list?: string } }) {
  return <ProxyBuilder initialList={searchParams.list} />;
}
