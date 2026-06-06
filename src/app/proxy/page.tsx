import { ProxyBuilder } from "@/components/ProxyBuilder";

export const metadata = {
  title: "Proxy Printer — pick cards to print | RiftCompare",
  robots: { index: false },
};

export default function ProxyPage({ searchParams }: { searchParams: { list?: string } }) {
  return <ProxyBuilder initialList={searchParams.list} />;
}
