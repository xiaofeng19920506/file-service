export type SlideShowRole = 'presenter' | 'projector';

export type SlideShowBusMessage =
  | { type: 'sync'; currentSlide: number; totalSlides: number; from: SlideShowRole }
  | { type: 'request-sync'; from: SlideShowRole }
  | { type: 'fullscreen'; from: SlideShowRole }
  | { type: 'close'; from: SlideShowRole };

function channelName(sessionId: string): string {
  return `bulletin-slideshow-${sessionId}`;
}

export function createSlideShowBus(sessionId: string) {
  const channel = new BroadcastChannel(channelName(sessionId));

  return {
    publish(message: SlideShowBusMessage) {
      channel.postMessage(message);
    },
    subscribe(handler: (message: SlideShowBusMessage) => void) {
      const onMessage = (event: MessageEvent<SlideShowBusMessage>) => {
        handler(event.data);
      };
      channel.addEventListener('message', onMessage);
      return () => channel.removeEventListener('message', onMessage);
    },
    close() {
      channel.close();
    },
  };
}
