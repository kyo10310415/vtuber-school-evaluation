#!/usr/bin/env node

/**
 * YouTube と X API のテストスクリプト
 */

// YouTube API テスト
async function testYouTubeAPI() {
  const YOUTUBE_API_KEY = 'AIzaSyBT-wSgP31w7-TshPem5eCCLSoGZcgndds';
  const channelId = 'UCXuqSBlHAE6Xw-yeJA0Tunw'; // Linus Tech Tips

  console.log('\n🎥 YouTube API テスト...');
  console.log(`チャンネルID: ${channelId}`);

  try {
    const url = `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&id=${channelId}&key=${YOUTUBE_API_KEY}`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.items && data.items.length > 0) {
      const channel = data.items[0];
      console.log('✅ YouTube API 成功:');
      console.log(`   チャンネル名: ${channel.snippet.title}`);
      console.log(`   登録者数: ${parseInt(channel.statistics.subscriberCount).toLocaleString()}`);
      console.log(`   総再生回数: ${parseInt(channel.statistics.viewCount).toLocaleString()}`);
      console.log(`   動画数: ${parseInt(channel.statistics.videoCount).toLocaleString()}`);
      return true;
    } else {
      console.log('❌ YouTube API エラー: チャンネルが見つかりません');
      return false;
    }
  } catch (error) {
    console.log(`❌ YouTube API エラー: ${error.message}`);
    return false;
  }
}

// X API テスト
async function testXAPI() {
  const X_BEARER_TOKEN = 'AAAAAAAAAAAAAAAAAAAAAFuSzwEAAAAALeDG6jk1hTBDVlVMIpso4sTC%2BOs%3DNvFKvfKNaaGtt11vHis0lKhs3YO8jgkCK0n2dcypKiWaUo6uFT';
  const username = 'jack';

  console.log('\n🐦 X API テスト...');
  console.log(`ユーザー名: @${username}`);

  try {
    const url = `https://api.x.com/2/users/by/username/${username}?user.fields=public_metrics`;
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${X_BEARER_TOKEN}`
      }
    });
    const data = await response.json();

    if (data.data) {
      const user = data.data;
      console.log('✅ X API 成功:');
      console.log(`   名前: ${user.name}`);
      console.log(`   ユーザー名: @${user.username}`);
      console.log(`   フォロワー数: ${user.public_metrics.followers_count.toLocaleString()}`);
      console.log(`   フォロー数: ${user.public_metrics.following_count.toLocaleString()}`);
      console.log(`   ツイート数: ${user.public_metrics.tweet_count.toLocaleString()}`);
      return true;
    } else {
      console.log('❌ X API エラー:', data);
      return false;
    }
  } catch (error) {
    console.log(`❌ X API エラー: ${error.message}`);
    return false;
  }
}

// 両方のAPIをテスト
async function main() {
  console.log('='.repeat(60));
  console.log('📡 YouTube & X API 接続テスト');
  console.log('='.repeat(60));

  const youtubeOk = await testYouTubeAPI();
  const xOk = await testXAPI();

  console.log('\n' + '='.repeat(60));
  console.log('📊 テスト結果:');
  console.log(`   YouTube API: ${youtubeOk ? '✅ 成功' : '❌ 失敗'}`);
  console.log(`   X API: ${xOk ? '✅ 成功' : '❌ 失敗'}`);
  console.log('='.repeat(60) + '\n');

  if (youtubeOk && xOk) {
    console.log('🎉 すべてのAPIが正常に動作しています！\n');
    process.exit(0);
  } else {
    console.log('⚠️  一部のAPIでエラーが発生しました\n');
    process.exit(1);
  }
}

main();
