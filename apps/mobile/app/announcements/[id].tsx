import { useLocalSearchParams } from "expo-router";
import { AnnouncementDetailScreen } from "@/features/announcements/screens/announcement-detail-screen";

export default function AnnouncementDetailRoute() {
  const { id } = useLocalSearchParams<{ id?: string }>();

  return <AnnouncementDetailScreen announcementId={id ?? ""} />;
}
