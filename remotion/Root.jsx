import { Composition, staticFile } from "remotion";
import { ShareClip } from "./Composition";

export const RemotionRoot = () => {
  return (
    <Composition
      id="ShareClip"
      component={ShareClip}
      durationInFrames={150}
      fps={30}
      width={1080}
      height={1920}
      defaultProps={{
        videoSrc: staticFile("remotion-test.mp4"),
        hook: "AI caught what was stopping this climb",
        coachingCaption:
          "Coach: Turn your hip toward the wall before making the next reach.",
      }}
    />
  );
};
