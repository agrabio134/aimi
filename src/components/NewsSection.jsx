// src/components/NewsSection.js
import React, { useState, useEffect } from 'react';
import TweetModal from './TweetModal';
import { fetchTweets } from '../utils/api';

const NewsSection = () => {
  const [tweets, setTweets] = useState([]);
  const [selectedTweet, setSelectedTweet] = useState(null);

  useEffect(() => {
    const loadTweets = async () => {
      const tweetData = await fetchTweets();
      setTweets(tweetData);
    };
    loadTweets();
    const interval = setInterval(loadTweets, 30 * 1000);
    return () => clearInterval(interval);
  }, []);

  const defaultNews = [
    { title: '🔥 Solana meme tokens surge with 300% volume increase', time: '2h ago', type: 'trending' },
    { title: '🤖 AI detects new opportunities in SOL pairs', time: '4h ago', type: 'ai' },
    { title: '💎 Community rallying behind top SOL tokens', time: '6h ago', type: 'community' },
    { title: '🚀 Golden ticker boosts drive massive engagement', time: '8h ago', type: 'boost' }
  ];

  const getRelativeTime = (timestamp) => {
    const now = new Date();
    const date = new Date(timestamp);
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${Math.floor(diffHours / 24)}d ago`;
  };

  const newsToDisplay = tweets.length > 0 
    ? tweets.map((tweet, idx) => ({
        title: `${tweet.user?.name || 'Crypto'}: ${tweet.text?.slice(0, 80) || 'Update'}...`,
        time: getRelativeTime(tweet.created_at),
        type: 'trending',
        tweet
      }))
    : defaultNews;

  return (
    <div className="news-section">
      <h3>📰 Latest Crypto Updates</h3>
      <div className="news-list">
        {newsToDisplay.map((item, idx) => (
          <div 
            key={`news-${idx}`} 
            className={`news-item ${item.type}`}
            onClick={() => item.tweet && setSelectedTweet(item.tweet)}
          >
            <div className="news-title">{item.title}</div>
            <div className="news-time">{item.time}</div>
          </div>
        ))}
      </div>
      <TweetModal tweet={selectedTweet} onClose={() => setSelectedTweet(null)} />
    </div>
  );
};

export default NewsSection;