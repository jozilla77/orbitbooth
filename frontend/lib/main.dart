import 'package:flutter/material.dart';
import 'package:flame/game.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'package:http/http.dart' as http;
import 'dart:convert';
import 'game/orbit_game.dart';

// TODO: Replace with your actual Web Client ID from Google Cloud Console
const String kClientId = 'YOUR_WEB_CLIENT_ID.apps.googleusercontent.com';

GoogleSignIn _googleSignIn = GoogleSignIn(
  clientId: kClientId,
  scopes: ['email', 'profile'],
);

void main() {
  runApp(const OrbitGameApp());
}

class OrbitGameApp extends StatelessWidget {
  const OrbitGameApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Orbit Booth Game',
      theme: ThemeData(
        brightness: Brightness.dark,
        primarySwatch: Colors.blue,
      ),
      home: const GameScreen(),
    );
  }
}

class GameScreen extends StatefulWidget {
  const GameScreen({super.key});

  @override
  State<GameScreen> createState() => _GameScreenState();
}

class _GameScreenState extends State<GameScreen> {
  late final OrbitGame game;
  GoogleSignInAccount? _currentUser;
  bool _isSubmitting = false;

  @override
  void initState() {
    super.initState();
    game = OrbitGame();
    game.levelManager.addListener(_onLevelManagerUpdate);

    _googleSignIn.onCurrentUserChanged.listen((GoogleSignInAccount? account) {
      setState(() {
        _currentUser = account;
      });
    });
    _googleSignIn.signInSilently();
  }

  @override
  void dispose() {
    game.levelManager.removeListener(_onLevelManagerUpdate);
    super.dispose();
  }

  void _onLevelManagerUpdate() {
    setState(() {}); // Rebuild to update HUD
    
    // Check if game over state was triggered
    if (game.gameState == GameState.gameOver) {
      _showGameOverDialog();
    }
  }

  Future<void> _handleSignIn() async {
    try {
      await _googleSignIn.signIn();
    } catch (error) {
      print('Sign in error: $error');
    }
  }

  Future<void> _submitScore() async {
    if (_currentUser == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please sign in to submit your score')),
      );
      return;
    }

    setState(() {
      _isSubmitting = true;
    });

    try {
      final response = await http.post(
        Uri.parse('/api/score'), // Relative path to Go backend
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'playerName': _currentUser!.displayName ?? _currentUser!.email,
          'score': game.levelManager.score,
        }),
      );

      if (response.statusCode == 201) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Score submitted successfully!')),
        );
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Failed to submit score.')),
        );
      }
    } catch (e) {
      print('Error submitting score: $e');
    } finally {
      setState(() {
        _isSubmitting = false;
      });
    }
  }

  void _showGameOverDialog() {
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (BuildContext context) {
        return StatefulBuilder(
          builder: (context, setState) {
            return AlertDialog(
              title: const Text('Game Over!'),
              content: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text('Score: ${game.levelManager.score}', style: const TextStyle(fontSize: 24)),
                  Text('High Score: ${game.levelManager.highScore}'),
                  const SizedBox(height: 20),
                  if (_currentUser == null)
                    ElevatedButton.icon(
                      icon: const Icon(Icons.login),
                      label: const Text('Sign in with Google to Submit'),
                      onPressed: () async {
                        await _handleSignIn();
                        setState(() {}); // Rebuild dialog to show submit button
                      },
                    )
                  else
                    ElevatedButton(
                      onPressed: _isSubmitting ? null : () async {
                        setState(() => _isSubmitting = true);
                        await _submitScore();
                        setState(() => _isSubmitting = false);
                        Navigator.of(context).pop();
                        game.gameState = GameState.mainMenu;
                        this.setState(() {}); // Rebuild main screen
                      },
                      child: _isSubmitting ? const CircularProgressPadding() : const Text('Submit Score'),
                    ),
                ],
              ),
              actions: [
                TextButton(
                  onPressed: () {
                    Navigator.of(context).pop();
                    game.startGame();
                  },
                  child: const Text('Play Again'),
                ),
                TextButton(
                  onPressed: () {
                    Navigator.of(context).pop();
                    setState(() {
                      game.gameState = GameState.mainMenu;
                    });
                  },
                  child: const Text('Main Menu'),
                ),
              ],
            );
          }
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Stack(
        children: [
          // The Game layer
          Positioned.fill(
            child: GameWidget(game: game),
          ),

          // Main Menu Overlay
          if (game.gameState == GameState.mainMenu)
            Center(
              child: Container(
                padding: const EdgeInsets.all(32),
                decoration: BoxDecoration(
                  color: Colors.black87,
                  borderRadius: BorderRadius.circular(16),
                ),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Text('Orbit Booth', style: TextStyle(fontSize: 48, fontWeight: FontWeight.bold)),
                    const SizedBox(height: 20),
                    ElevatedButton(
                      style: ElevatedButton.styleFrom(
                        padding: const EdgeInsets.symmetric(horizontal: 48, vertical: 16),
                        textStyle: const TextStyle(fontSize: 24),
                      ),
                      onPressed: () {
                        setState(() {
                          game.startGame();
                        });
                      },
                      child: const Text('START'),
                    ),
                    const SizedBox(height: 20),
                    if (_currentUser == null)
                      OutlinedButton.icon(
                        icon: const Icon(Icons.login),
                        label: const Text('Sign in with Google'),
                        onPressed: _handleSignIn,
                      )
                    else
                      Text('Signed in as ${_currentUser!.displayName}'),
                  ],
                ),
              ),
            ),

          // HUD Overlay
          if (game.gameState == GameState.playing || game.gameState == GameState.ready)
            Positioned(
              top: 20,
              left: 20,
              right: 20,
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  // Score & High Score
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: Colors.black54,
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          'Score: ${game.levelManager.score}',
                          style: const TextStyle(color: Colors.white, fontSize: 24, fontWeight: FontWeight.bold),
                        ),
                        Text(
                          'High: ${game.levelManager.highScore}',
                          style: const TextStyle(color: Colors.white70, fontSize: 16, fontWeight: FontWeight.bold),
                        ),
                      ],
                    ),
                  ),
                  // Level Indicator
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: game.levelManager.level == 3 ? Colors.red.withOpacity(0.8) : 
                             game.levelManager.level == 2 ? Colors.orange.withOpacity(0.8) : 
                             Colors.blue.withOpacity(0.8),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Text(
                      'LEVEL ${game.levelManager.level}',
                      style: const TextStyle(color: Colors.white, fontSize: 24, fontWeight: FontWeight.bold),
                    ),
                  ),
                ],
              ),
            ),

          // Ready State Overlay
          if (game.gameState == GameState.ready)
            const Center(
              child: Text(
                'TAP TO JUMP', 
                style: TextStyle(
                  fontSize: 48, 
                  fontWeight: FontWeight.bold, 
                  color: Colors.white,
                  shadows: [Shadow(color: Colors.black, blurRadius: 10)]
                )
              ),
            ),
        ],
      ),
    );
  }
}

class CircularProgressPadding extends StatelessWidget {
  const CircularProgressPadding({super.key});

  @override
  Widget build(BuildContext context) {
    return const Padding(
      padding: EdgeInsets.all(4.0),
      child: SizedBox(
        width: 16,
        height: 16,
        child: CircularProgressIndicator(strokeWidth: 2),
      ),
    );
  }
}
