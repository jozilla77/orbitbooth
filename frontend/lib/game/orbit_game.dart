import 'package:flame/components.dart';
import 'package:flame/game.dart';
import 'package:flame/camera.dart';
import 'package:flame/collisions.dart';
import 'package:flutter/painting.dart';
import 'dart:ui';
import 'package:flame/events.dart';
import 'package:flame/parallax.dart';
import 'player.dart';
import 'obstacle_manager.dart';
import 'level_manager.dart';

enum GameState { mainMenu, ready, playing, gameOver }

class OrbitGame extends FlameGame with HasCollisionDetection, TapCallbacks {
  final LevelManager levelManager = LevelManager();
  final ObstacleManager obstacleManager = ObstacleManager();
  late Player player;
  late Ground ground;
  late ScrollingBackground background;

  OrbitGame() : super(
    camera: CameraComponent.withFixedResolution(width: 800, height: 600)
  );

  // Physics constants (pixels per second)
  final double gravity = 1200.0;
  final double jumpStrength = -400.0;

  GameState gameState = GameState.mainMenu;

  double get currentSpeed => levelManager.currentSpeed;

  @override
  Future<void> onLoad() async {
    await super.onLoad();
    
    world.add(obstacleManager);

    // Add scrolling background
    background = ScrollingBackground();
    camera.backdrop.add(background);

    // Add the ground
    ground = Ground();
    world.add(ground);
    
    // Initialize player but don't add to world until playing
    player = Player(Vector2(200, 300));
  }

  void startGame() {
    gameState = GameState.ready;
    levelManager.reset();
    obstacleManager.reset();
    
    if (player.parent == null) {
      world.add(player);
    }
    player.resetPlayer(Vector2(200, 300));
  }

  void gameOver() {
    gameState = GameState.gameOver;
    levelManager.triggerGameOver();
  }

  @override
  void onTapDown(TapDownEvent event) {
    if (gameState == GameState.ready) {
      gameState = GameState.playing;
      levelManager.notifyUI(); // Force UI update to hide "TAP TO JUMP"
      player.flap();
    } else if (gameState == GameState.playing) {
      player.flap();
    }
  }
}

class ScrollingBackground extends ParallaxComponent<OrbitGame> {
  int _currentLevel = 1;

  @override
  void onGameResize(Vector2 size) {
    super.onGameResize(size);
    // Background fills the 800x600 logical space
    this.size = Vector2(800, 600);
  }

  @override
  Future<void> onLoad() async {
    await _loadParallaxForLevel(1);
  }

  Future<void> _loadParallaxForLevel(int level) async {
    String imagePath = level >= 3 ? 'bg_temple.png' : 'bg_city.png';
    
    try {
      parallax = await game.loadParallax(
        [ParallaxImageData(imagePath)],
        baseVelocity: Vector2(game.currentSpeed * 0.5, 0),
        repeat: ImageRepeat.repeat,
        fill: LayerFill.height,
      );
    } catch (e) {
      print('Warning: Background image $imagePath not found in assets/images/');
    }
  }

  @override
  void update(double dt) {
    super.update(dt);
    
    if (game.gameState == GameState.playing || game.gameState == GameState.ready) {
      if (_currentLevel != game.levelManager.level) {
        _currentLevel = game.levelManager.level;
        _loadParallaxForLevel(_currentLevel);
      }
      parallax?.baseVelocity = Vector2(game.currentSpeed * 0.5, 0); 
    } else {
      parallax?.baseVelocity = Vector2.zero();
    }
  }
}

class Ground extends PositionComponent with HasGameRef<OrbitGame> {
  Ground() : super(
    position: Vector2(400, 590), // Center of ground at bottom
    size: Vector2(800, 20),
    anchor: Anchor.center,
  );

  @override
  Future<void> onLoad() async {
    await super.onLoad();
    add(RectangleHitbox());
  }

  @override
  void render(Canvas canvas) {
    super.render(canvas);
    final paint = Paint()..color = const Color(0xFF8B4513);
    canvas.drawRect(size.toRect(), paint);
  }
}
