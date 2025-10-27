// src/components/TweetModal.js
import React from 'react';

const TweetModal = ({ tweet, onClose }) => {
  if (!tweet) return null;

  let imageUrl = null;
  let videoUrl = null;

  if (tweet.entities?.urls) {
    tweet.entities.urls.forEach(urlObj => {
      const expanded = urlObj.expanded_url || urlObj.url;
      if (expanded.includes('pbs.twimg.com/media')) {
        const mediaMatch = expanded.match(/\/media\/([^?]+)/);
        if (mediaMatch) {
          const mediaId = mediaMatch[1];
          imageUrl = `https://pbs.twimg.com/media/${mediaId}?format=png&name=large`;
        }
      }
    });
  }

  if (tweet.attachments?.media_keys && !imageUrl) {
    const mediaKey = tweet.attachments.media_keys[0];
    imageUrl = `https://pbs.twimg.com/media/${mediaKey}?format=png&name=large`;
  }

  if (tweet.includes?.media) {
    tweet.includes.media.forEach(media => {
      if (media.type === 'photo' && !imageUrl) {
        imageUrl = media.url || media.media_key ? `https://pbs.twimg.com/media/${media.media_key}?format=png&name=large` : null;
      } else if (media.type === 'video' && !videoUrl) {
        videoUrl = media.variants?.[0]?.url || null;
      }
    });
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="tweet-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Tweet Details</h2>
          <button onClick={onClose}>×</button>
        </div>
        <div className="tweet-content">
          <div className="tweet-profile">
            {tweet.user?.profile_image_url && <img src={tweet.user.profile_image_url.replace('_normal', '_bigger')} alt={tweet.user.name} className="tweet-pfp" />}
            <div className="tweet-user-info">
              <strong>{tweet.user?.name || 'Anonymous'}</strong>
              <span>@{tweet.user?.username || ''}</span>
            </div>
          </div>
          <p className="tweet-text">{tweet.text}</p>
          {/* {imageUrl && <img src={imageUrl} alt="Tweet media" className="tweet-image" />}
          {videoUrl && <video src={videoUrl} controls className="tweet-video" style={{ maxWidth: '100%', borderRadius: '12px' }} />} */}
        </div>
      </div>
    </div>
  );
};

export default TweetModal;