import { AbsoluteFill } from "remotion";
import { Video } from "@remotion/media";

export const ShareClip = ({ videoSrc, hook, coachingCaption }) => {
  return (
    <AbsoluteFill style={{ backgroundColor: "black" }}>
      <Video
        src={videoSrc}
        style={{
          width: "100%",
          height: "100%",
        }}
        objectFit="cover"
      />

      <div
        style={{
          position: "absolute",
          top: 90,
          left: 60,
          right: 60,
          padding: "24px 30px",
          backgroundColor: "rgba(0, 0, 0, 0.7)",
          borderRadius: 24,
          color: "white",
          fontSize: 58,
          fontWeight: 700,
          fontFamily: "sans-serif",
          textAlign: "center",
        }}
      >
        {hook}
      </div>

      <div
        style={{
          position: "absolute",
          bottom: 120,
          left: 60,
          right: 60,
          padding: "28px 32px",
          backgroundColor: "rgba(0, 0, 0, 0.75)",
          borderRadius: 24,
          color: "white",
          fontSize: 42,
          fontWeight: 600,
          fontFamily: "sans-serif",
        }}
      >
        {coachingCaption}
      </div>
    </AbsoluteFill>
  );
};
