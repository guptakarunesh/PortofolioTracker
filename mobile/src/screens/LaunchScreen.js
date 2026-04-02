import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  Image,
  StatusBar,
  StyleSheet,
  View
} from 'react-native';

const SPLASH_IMAGE = require('../assets/worthio-splash-screen.png');

export default function WorthioSplash({ onFinish = () => {} }) {
  const rootOpacity = useRef(new Animated.Value(1)).current;
  const imageOpacity = useRef(new Animated.Value(0)).current;
  const imageScale = useRef(new Animated.Value(1.14)).current;

  const glow1X = useRef(new Animated.Value(0)).current;
  const glow1Y = useRef(new Animated.Value(0)).current;
  const glow1Scale = useRef(new Animated.Value(1)).current;
  const glow1Opacity = useRef(new Animated.Value(0.18)).current;

  const glow2X = useRef(new Animated.Value(0)).current;
  const glow2Y = useRef(new Animated.Value(0)).current;
  const glow2Scale = useRef(new Animated.Value(1)).current;
  const glow2Opacity = useRef(new Animated.Value(0.1)).current;

  useEffect(() => {
    const intro = Animated.parallel([
      Animated.timing(imageOpacity, {
        toValue: 1,
        duration: 1100,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true
      }),
      Animated.timing(imageScale, {
        toValue: 1,
        duration: 1400,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true
      })
    ]);

    const glow1Loop = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(glow1X, {
            toValue: -10,
            duration: 1800,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true
          }),
          Animated.timing(glow1Y, {
            toValue: -14,
            duration: 1800,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true
          }),
          Animated.timing(glow1Scale, {
            toValue: 1.08,
            duration: 1800,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true
          }),
          Animated.timing(glow1Opacity, {
            toValue: 0.24,
            duration: 1800,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true
          })
        ]),
        Animated.parallel([
          Animated.timing(glow1X, {
            toValue: 0,
            duration: 1800,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true
          }),
          Animated.timing(glow1Y, {
            toValue: 0,
            duration: 1800,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true
          }),
          Animated.timing(glow1Scale, {
            toValue: 1,
            duration: 1800,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true
          }),
          Animated.timing(glow1Opacity, {
            toValue: 0.18,
            duration: 1800,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true
          })
        ])
      ])
    );

    const glow2Loop = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(glow2X, {
            toValue: 8,
            duration: 2200,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true
          }),
          Animated.timing(glow2Y, {
            toValue: 10,
            duration: 2200,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true
          }),
          Animated.timing(glow2Scale, {
            toValue: 1.05,
            duration: 2200,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true
          }),
          Animated.timing(glow2Opacity, {
            toValue: 0.14,
            duration: 2200,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true
          })
        ]),
        Animated.parallel([
          Animated.timing(glow2X, {
            toValue: 0,
            duration: 2200,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true
          }),
          Animated.timing(glow2Y, {
            toValue: 0,
            duration: 2200,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true
          }),
          Animated.timing(glow2Scale, {
            toValue: 1,
            duration: 2200,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true
          }),
          Animated.timing(glow2Opacity, {
            toValue: 0.1,
            duration: 2200,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true
          })
        ])
      ])
    );

    intro.start();
    glow1Loop.start();
    glow2Loop.start();

    const outroTimer = setTimeout(() => {
      Animated.timing(rootOpacity, {
        toValue: 0,
        duration: 520,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true
      }).start(({ finished }) => {
        glow1Loop.stop();
        glow2Loop.stop();
        if (finished) onFinish();
      });
    }, 3600);

    return () => {
      clearTimeout(outroTimer);
      glow1Loop.stop();
      glow2Loop.stop();
    };
  }, [
    glow1Opacity,
    glow1Scale,
    glow1X,
    glow1Y,
    glow2Opacity,
    glow2Scale,
    glow2X,
    glow2Y,
    imageOpacity,
    imageScale,
    onFinish,
    rootOpacity
  ]);

  return (
    <Animated.View style={[styles.container, { opacity: rootOpacity }]}>
      <StatusBar barStyle="light-content" backgroundColor="#0B1F3A" />

      <Animated.View
        pointerEvents="none"
        style={[
          styles.fadeVeil,
          {
            opacity: imageOpacity.interpolate({
              inputRange: [0, 1],
              outputRange: [0.34, 0]
            })
          }
        ]}
      />

      <Animated.View
        pointerEvents="none"
        style={[
          styles.glowBottomRight,
          {
            opacity: glow1Opacity,
            transform: [
              { translateX: glow1X },
              { translateY: glow1Y },
              { scale: glow1Scale }
            ]
          }
        ]}
      />

      <Animated.View
        pointerEvents="none"
        style={[
          styles.glowTopArea,
          {
            opacity: glow2Opacity,
            transform: [
              { translateX: glow2X },
              { translateY: glow2Y },
              { scale: glow2Scale }
            ]
          }
        ]}
      />

      <Animated.View
        style={[
          styles.imageWrap,
          {
            opacity: imageOpacity,
            transform: [{ scale: imageScale }]
          }
        ]}
      >
        <Image source={SPLASH_IMAGE} style={styles.image} resizeMode="cover" />
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0B1F3A',
    overflow: 'hidden',
    zIndex: 2000,
    elevation: 2000
  },
  fadeVeil: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#07162B',
    zIndex: 1
  },
  imageWrap: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 2
  },
  image: {
    width: '100%',
    height: '100%'
  },
  glowBottomRight: {
    position: 'absolute',
    right: -90,
    bottom: -90,
    width: 320,
    height: 320,
    borderRadius: 160,
    backgroundColor: '#3CF7D4',
    zIndex: 0
  },
  glowTopArea: {
    position: 'absolute',
    top: -120,
    right: -40,
    width: 340,
    height: 340,
    borderRadius: 170,
    backgroundColor: '#2F7BFF',
    zIndex: 0
  }
});
