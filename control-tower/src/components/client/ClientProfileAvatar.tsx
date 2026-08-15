import Image from "next/image";

function versionedPhotoUrl(photoUrl: string, updatedAt: string) {
  if (!photoUrl) return "";
  try {
    const url = new URL(photoUrl);
    if (updatedAt) url.searchParams.set("mdn_v", updatedAt);
    return url.toString();
  } catch {
    return "";
  }
}

export default function ClientProfileAvatar({
  className,
  fullName,
  photoUrl,
  photoUpdatedAt,
  sizes,
}: {
  className: string;
  fullName: string;
  photoUrl: string;
  photoUpdatedAt: string;
  sizes: string;
}) {
  const initials = fullName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "MD";
  const src = versionedPhotoUrl(photoUrl, photoUpdatedAt);
  return (
    <span className={className}>
      {src ? <Image src={src} alt={`${fullName} profile photo`} fill sizes={sizes} unoptimized /> : initials}
    </span>
  );
}
