import { PageHeader } from "@/components/ui";
import { SharePointPanel } from "@/components/sharepoint/SharePointPanel";
import { DealPipeline } from "@/components/data-rooms/DealPipeline";

export default function DataRoomsPage() {
  return (
    <>
      <PageHeader title="Data Rooms" subtitle="Auto-generated, SharePoint-synced data rooms per transaction" />

      {/* Live SharePoint: create/sync data rooms and browse real files. */}
      <div className="mb-6">
        <SharePointPanel />
      </div>

      {/* Deal pipeline — reads the live backend at runtime (seed fallback). */}
      <DealPipeline />
    </>
  );
}
