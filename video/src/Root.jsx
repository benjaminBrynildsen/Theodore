import { Composition } from 'remotion';
import { GermaniaPromo } from './GermaniaPromo';
import { TheodorePromo } from './TheodorePromo';
import { TheodorePromoV2 } from './TheodorePromoV2';

export const RemotionRoot = () => {
  return (
    <>
      <Composition
        id="GermaniaPromo"
        component={GermaniaPromo}
        durationInFrames={150}
        fps={30}
        width={1080}
        height={1080}
        defaultProps={{
          headline: "Fresh Brewed Daily",
          subtext: "Germania Brew Haus · Alton, IL",
          accentColor: "#8B4513",
          bgColor: "#1a0a00",
          tagline: "Coffee. Community. Craft.",
        }}
      />
      <Composition
        id="TheodorePromo"
        component={TheodorePromo}
        durationInFrames={180}
        fps={30}
        width={1080}
        height={1080}
      />
      <Composition
        id="TheodorePromoV2"
        component={TheodorePromoV2}
        durationInFrames={270}
        fps={30}
        width={1080}
        height={1080}
      />
    </>
  );
};
