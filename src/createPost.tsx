import { Devvit } from '@devvit/public-api';

// Configure Devvit's plugins
Devvit.configure({
  redditAPI: true,
});

// Adds a new menu item to the subreddit allowing you to create a new r/populace Simulator post
Devvit.addMenuItem({
  label: 'Create New r/populace Simulator Post',
  location: 'subreddit',
  onPress: async (_event, context) => {
    const { reddit, ui } = context;
    const subreddit = await reddit.getCurrentSubreddit();
    const post = await reddit.submitPost({
      title: 'r/populace Simulator: Engage in the Political Simulator!',
      subredditName: subreddit.name,
      // The preview appears while the post loads
      preview: (
        <vstack height="100%" width="100%" alignment="middle center">
          <text size="large">Loading r/populace Simulator ...</text>
        </vstack>
      ),
    });
    ui.showToast({ text: 'Simulator post created!' });
    ui.navigateTo(post);
  },
});
