import PageSkeleton from "@/components/system/PageSkeleton";

export default function RootLoading() {
  return (
    <PageSkeleton
      title="Loading Crezvion POS"
      subtitle="Starting the application shell and your latest session."
      rows={5}
    />
  );
}
