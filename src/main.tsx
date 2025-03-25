import './createPost.js';
import { Devvit, useState, useWebView } from '@devvit/public-api';
import type { DevvitMessage, WebViewMessage } from './message.js';
import * as simulation from './simulation.js';
import 'dotenv/config';

Devvit.configure({
  redditAPI: true,
  redis: true,
});

// Add a custom post type for the r/populace Simulator
Devvit.addCustomPostType({
  name: 'r/populace Simulator',
  height: 'tall',
  render: (context) => {
    // Load the current authenticated username from Devvit
    const [username] = useState(async () => {
      return (await context.reddit.getCurrentUsername()) ?? 'anon';
    });

    // Load the current game state from Redis, initializing if needed.
    const [gameState, setGameState] = useState(async () => {
      const storedState = await context.redis.get('gameState');
      if (storedState) {
        return JSON.parse(storedState);
      } else {
        const defaultState = simulation.getDefaultState();
        await context.redis.set('gameState', JSON.stringify(defaultState));
        return defaultState;
      }
    });

    const webView = useWebView<WebViewMessage, DevvitMessage>({
      url: 'page.html',
      async onMessage(message, webView) {
        let updatedState;
        switch (message.type) {
          case 'webViewReady':
            webView.postMessage({
              type: 'initialData',
              data: { username: username, gameState: gameState },
            });
            break;
          case 'getGameState':
            // Polling request – send back the current game state
            webView.postMessage({
              type: 'updateGameState',
              data: { gameState: gameState },
            });
            break;
          case 'simulateEvent':
            updatedState = await simulation.simulateEvent(context.redis, gameState);
            setGameState(updatedState);
            webView.postMessage({
              type: 'updateGameState',
              data: { gameState: updatedState },
            });
            break;
          case 'draftLaw':
            updatedState = await simulation.draftLaw(context.redis, gameState, message.data.law);
            setGameState(updatedState);
            webView.postMessage({
              type: 'updateGameState',
              data: { gameState: updatedState },
            });
            break;
          case 'voteOnLaw':
            // Use the authenticated username rather than a client-supplied voter
            updatedState = await simulation.voteOnLaw(
              context.redis,
              gameState,
              username,
              message.data.lawId,
              message.data.vote
            );
            setGameState(updatedState);
            webView.postMessage({
              type: 'updateGameState',
              data: { gameState: updatedState },
            });
            break;
          case 'voteSenator':
            updatedState = await simulation.voteSenator(
              context.redis,
              gameState,
              username,
              message.data.candidate
            );
            setGameState(updatedState);
            webView.postMessage({
              type: 'updateGameState',
              data: { gameState: updatedState },
            });
            break;
          case 'votePresident':
            updatedState = await simulation.votePresident(
              context.redis,
              gameState,
              username,
              message.data.candidate
            );
            setGameState(updatedState);
            webView.postMessage({
              type: 'updateGameState',
              data: { gameState: updatedState },
            });
            break;
          case 'voteImpeach':
            updatedState = await simulation.voteToImpeach(
              context.redis,
              gameState,
              username,
              message.data.vote
            );
            setGameState(updatedState);
            webView.postMessage({
              type: 'updateGameState',
              data: { gameState: updatedState },
            });
            break;
          case 'protest':
            updatedState = await simulation.protest(
              context.redis,
              gameState,
              username,
              message.data.protestAmount
            );
            setGameState(updatedState);
            webView.postMessage({
              type: 'updateGameState',
              data: { gameState: updatedState },
            });
            break;
          case 'joinCoup':
            updatedState = await simulation.joinCoup(
              context.redis,
              gameState,
              username,
              message.data.coupAmount
            );
            setGameState(updatedState);
            webView.postMessage({
              type: 'updateGameState',
              data: { gameState: updatedState },
            });
            break;
          default:
            throw new Error(`Unknown message type: ${message.type}`);
        }
      },
      onUnmount() {
        context.ui.showToast('r/populace Simulator closed!');
      },
    });

    return (
      <vstack grow padding="small">
        <vstack grow alignment="middle center">
          <text size="xlarge" weight="bold">
            r/populace Simulator
          </text>
          <spacer />
          <vstack alignment="start middle">
            <hstack>
              <text size="medium">Username:</text>
              <text size="medium" weight="bold">
                {username ?? ''}
              </text>
            </hstack>
          </vstack>
          <spacer />
          <button onPress={() => webView.mount()}>Launch Simulator</button>
        </vstack>
      </vstack>
    );
  },
});

export default Devvit;