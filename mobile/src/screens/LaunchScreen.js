import React from 'react';
import { Animated, Image, StatusBar, StyleSheet } from 'react-native';

export default function WorthioSplash({ dark, onFinish = () => {} }) {
  const rootOpacity = React.useRef(new Animated.Value(1)).current;
  const scale = React.useRef(new Animated.Value(1.02)).current;
  const translateY = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    Animated.sequence([
      Animated.timing(scale, {
        toValue: 1,
        duration: 900,
        useNativeDriver: true
      }),
      Animated.delay(2500),
      Animated.parallel([
        Animated.timing(rootOpacity, {
          toValue: 0,
          duration: 850,
          useNativeDriver: true
        }),
        Animated.timing(scale, {
          toValue: 0.992,
          duration: 850,
          useNativeDriver: true
        }),
        Animated.timing(translateY, {
          toValue: -10,
          duration: 850,
          useNativeDriver: true
        })
      ])
    ]).start(({ finished }) => {
      if (finished) onFinish();
    });
  }, [onFinish, rootOpacity, scale, translateY]);

  const splashSource = require('../assets/worthio-splash-screen.png');

  return (
    <Animated.View
      style={[
        styles.root,
        dark && styles.rootDark,
        {
          opacity: rootOpacity,
          transform: [{ scale }, { translateY }]
        }
      ]}
    >
      <StatusBar barStyle="light-content" />
      <Image source={splashSource} style={styles.image} resizeMode="cover" />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    flex: 1,
    backgroundColor: '#0B1F3A',
    zIndex: 2000,
    elevation: 2000
  },
  rootDark: {
    backgroundColor: '#0B1F3A'
  },
  image: {
    width: '100%',
    height: '100%'
  }
});
