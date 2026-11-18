import React from "react"

interface IProps {
  // Fades out once the chat page shows, then stays hidden
  visible: boolean
}

const boneColour = "#e2e8f0"

// Empty divs on the host page, so the box is set inline against host rules such as `div:empty { display: none }`
function Bone({ style }: { style: React.CSSProperties }) {
  return (
    <div
      className="lumi-skeleton-bone"
      style={{ display: "block", margin: 0, padding: 0, backgroundColor: boneColour, borderRadius: 6, flexShrink: 0, ...style }}
    />
  )
}

// A placeholder in the chat page's shape, shown over its iframe while it loads: the header with the avatar and name, the
// fresh chat's centred avatar and greeting, the disclaimer, the message box and the "made by" footer. Decorative, as the
// container announces the loading itself; it pulses unless the visitor prefers reduced motion (see launcherStyles). It
// inherits the container's visibility while shown, so it hides with the closed chat
export default function ChatSkeleton({ visible }: IProps) {
  return (
    <div
      aria-hidden="true"
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        backgroundColor: "white",
        pointerEvents: "none",
        opacity: visible ? 1 : 0,
        visibility: visible ? undefined : "hidden",
        transition: visible ? "none" : "opacity 200ms ease-out, visibility 0s 200ms",
      }}
    >
      <div
        style={{
          boxSizing: "border-box",
          display: "flex",
          alignItems: "center",
          gap: 12,
          height: 56,
          padding: "4px 20px",
          borderBottom: "1px solid #cbd5e1",
        }}
      >
        <Bone style={{ width: 40, height: 40, borderRadius: 8 }} />
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <Bone style={{ width: 96, height: 14 }} />
          <Bone style={{ width: 160, height: 10 }} />
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, flexGrow: 1, padding: "8px 12px 0" }}>
        <Bone style={{ width: 64, height: 64, borderRadius: 12, marginBottom: 6 }} />
        <Bone style={{ width: "55%", height: 14 }} />
        <Bone style={{ width: "35%", height: 14 }} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: "0 8px 48px" }}>
        <Bone style={{ width: "60%", height: 10 }} />
        <div style={{ display: "flex", alignItems: "flex-end", gap: 8, width: "100%" }}>
          <Bone style={{ width: 40, height: 40, borderRadius: 9999 }} />
          <Bone style={{ flexGrow: 1, height: 40, borderRadius: 12 }} />
        </div>
      </div>
      <Bone style={{ position: "absolute", bottom: 19, left: "50%", transform: "translateX(-50%)", width: 120, height: 10 }} />
    </div>
  )
}
