import React from 'react';
import { StyleSheet, View } from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';

export default function LaunchScreen({ dark, onDone = () => {} }) {
  const doneRef = React.useRef(false);
  const player = useVideoPlayer(require('../assets/networth_manager_premium_launch.mp4'), (instance) => {
    instance.loop = false;
    instance.muted = true;
    instance.play();
  });

  React.useEffect(() => {
    const sub = player.addListener('playToEnd', () => {
      if (doneRef.current) return;
      doneRef.current = true;
      onDone();
    });
    return () => sub.remove();
  }, [onDone, player]);

  return (
    <View style={[styles.root, dark && styles.rootDark]}>
      <VideoView
        player={player}
        style={styles.video}
        contentFit="cover"
        nativeControls={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000',
    overflow: 'hidden',
    position: 'relative'
  },
  rootDark: {
    backgroundColor: '#000'
  },
  video: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%'
  }
});
