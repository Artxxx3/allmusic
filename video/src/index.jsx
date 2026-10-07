import React from 'react';
import { Composition, registerRoot, staticFile } from 'remotion';
import { loadFont } from '@remotion/fonts';
import { Promo, DURATION } from './Promo.jsx';
import { Demo, DEMO_DURATION } from './Demo.jsx';
import { Demo2, DEMO2_DURATION } from './Demo2.jsx';

loadFont({ family: 'Inter', url: staticFile('inter-latin-wght-normal.woff2'), weight: '100 900' });
loadFont({ family: 'Space Grotesk', url: staticFile('space-grotesk-latin-wght-normal.woff2'), weight: '300 700' });

const Root = () => (
  <>
    <Composition id="Promo" component={Promo} durationInFrames={DURATION} fps={30} width={1920} height={1080} />
    <Composition id="Demo" component={Demo} durationInFrames={DEMO_DURATION} fps={30} width={1920} height={1080} />
    <Composition id="Demo2" component={Demo2} durationInFrames={DEMO2_DURATION} fps={30} width={1920} height={1080} />
  </>
);

registerRoot(Root);
