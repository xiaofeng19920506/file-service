import { describe, it, expect } from 'vitest';
import { mapYoutubeApiError } from './youtube-oauth.js';

describe('mapYoutubeApiError', () => {
  it('maps disabled YouTube Data API v3', () => {
    expect(
      mapYoutubeApiError(
        'YouTube Data API v3 has not been used in project 123 before or it is disabled. Enable it by visiting ...',
      ),
    ).toBe('youtube_api_not_enabled');
  });

  it('maps accessNotConfigured reason', () => {
    expect(mapYoutubeApiError('accessNotConfigured')).toBe('youtube_api_not_enabled');
  });

  it('maps youtubeSignupRequired', () => {
    expect(mapYoutubeApiError('youtubeSignupRequired')).toBe('youtube_channel_required');
  });
});
