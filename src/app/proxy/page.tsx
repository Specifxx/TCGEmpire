import { ProxySheet } from "@/components/ProxySheet";

export const metadata = {
  title: "Proxy Sheet — RiftCompareAU",
  robots: { index: false },
};

export default function ProxyPage({ searchParams }: { searchParams: { list?: string } }) {
  return <ProxySheet initialList={searchParams.list} />;
}
