import { ImageResponse } from "next/og";
import { notFound } from "next/navigation";

import { getPartnerProfileForPublicPage } from "@/lib/partnerProfiles";

export const alt = "My Drip Nurse Partner profile";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export default async function PartnerOpenGraphImage({ params }: Props) {
  const { slug } = await params;
  const profile = await getPartnerProfileForPublicPage(slug);
  if (!profile) notFound();

  const serviceArea = profile.serviceAreas
    .slice(0, 2)
    .map((area) => `${area.county}, ${area.state}`)
    .join(" · ");

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        position: "relative",
        overflow: "hidden",
        color: "#17343a",
        background: "#eaf4f6",
      }}
    >
      <div
        style={{
          position: "absolute",
          width: 420,
          height: 420,
          left: -120,
          bottom: -210,
          borderRadius: 999,
          background: "#cdeee5",
        }}
      />
      <div
        style={{
          width: 740,
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "58px 64px 54px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 15 }}>
          <div
            style={{
              width: 48,
              height: 48,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 14,
              color: "white",
              background: "#075c68",
              fontSize: 25,
              fontWeight: 800,
            }}
          >
            +
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <strong style={{ fontSize: 24, letterSpacing: -0.5 }}>My Drip Nurse</strong>
            <span style={{ color: "#557278", fontSize: 14, letterSpacing: 1.8, textTransform: "uppercase" }}>
              Verified Partner Network
            </span>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          {profile.businessName ? (
            <span style={{ color: "#087368", fontSize: 20, fontWeight: 800, marginBottom: 13 }}>
              {profile.businessName}
            </span>
          ) : null}
          <div style={{ fontFamily: "Georgia", fontSize: 62, lineHeight: 1.02, letterSpacing: -2.6 }}>
            {profile.displayName}
          </div>
          <div style={{ color: "#075c68", fontSize: 25, fontWeight: 750, marginTop: 20 }}>
            {profile.publicTitle || "Mobile IV Therapy Partner"}
          </div>
          {profile.professionalCredentials ? (
            <div style={{ color: "#6a7f83", fontSize: 21, marginTop: 8 }}>
              {profile.professionalCredentials}
            </div>
          ) : null}
        </div>

        <div style={{ display: "flex", alignItems: "center", color: "#557278", fontSize: 17 }}>
          <span
            style={{
              width: 9,
              height: 9,
              marginRight: 11,
              borderRadius: 999,
              background: "#087368",
            }}
          />
          {serviceArea || "Mobile IV therapy in your local community"}
        </div>
      </div>

      <div
        style={{
          width: 460,
          height: "100%",
          display: "flex",
          position: "relative",
          background: "#075c68",
        }}
      >
        {profile.profilePhotoUrl ? (
          // ImageResponse renders native images server-side; Next/Image is not supported here.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={profile.profilePhotoUrl}
            alt={`${profile.displayName}, My Drip Nurse Partner`}
            title={`${profile.displayName} mobile IV therapy Partner`}
            width="460"
            height="630"
            style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center 22%" }}
          />
        ) : (
          <div
            style={{
              width: "100%",
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "white",
              fontFamily: "Georgia",
              fontSize: 190,
              background: "linear-gradient(145deg, #174d57, #0a7481)",
            }}
          >
            {profile.displayName.slice(0, 1)}
          </div>
        )}
        <div
          style={{
            position: "absolute",
            left: 24,
            right: 24,
            bottom: 24,
            height: 8,
            borderRadius: 999,
            background: "#b8e978",
          }}
        />
      </div>
    </div>,
    size,
  );
}
