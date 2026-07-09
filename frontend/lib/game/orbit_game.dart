import 'package:flame/components.dart';
import 'package:flutter/painting.dart';
import 'package:flame/events.dart';
import 'package:flame/parallax.dart';
import 'package:flame_forge2d/flame_forge2d.dart';
import 'player.dart';
import 'obstacle_manager.dart';
import 'level_manager.dart';

enum GameState { mainMenu, playing, gameOver }

class OrbitGame extends Forge2DGame with TapCallbacks {
  OrbitGame() : super(gravity: Vector2(0, 80.0)); // Increased gravity for a snappier feel

  late Player player;
  late ObstacleManager obstacleManager;
  late LevelManager levelManager;
  late Ground ground;
  late ScrollingBackground background;

  GameState gameState = GameState.mainMenu;

  double get currentSpeed => levelManager.currentSpeed;

  @override
  Future<void> onLoad() async {
    await super.onLoad();
    
    levelManager = LevelManager();
    obstacleManager = ObstacleManager();
    add(obstacleManager);

    // Add scrolling background
    background = ScrollingBackground();
    camera.backdrop.add(background);

    // Add the ground
    ground = Ground();
    add(ground);
    
    // Initialize player but don't add to world until playing
    player = Player(Vector2(camera.visibleWorldRect.width / 4, camera.visibleWorldRect.height / 2));
  }

  void startGame() {
    gameState = GameState.playing;
    levelManager.reset();
    obstacleManager.reset();
    
    if (player.parent == null) {
      add(player);
    }
    player.reset(Vector2(camera.visibleWorldRect.width / 4, camera.visibleWorldRect.height / 2));
  }

  void gameOver() {
    gameState = GameState.gameOver;
    // We will handle UI updates and leaderboard submission in main.dart 
    // by listening to the game state or level manager.
  }

  @override
  void onTapDown(TapDownEvent event) {
    if (gameState == GameState.playing) {
      player.flap();
    }
  }
}

class ScrollingBackground extends ParallaxComponent<OrbitGame> {
  int _currentLevel = 1;

  @override
  Future<void> onLoad() async {
    await _loadParallaxForLevel(1);
  }

  Future<void> _loadParallaxForLevel(int level) async {
    // Determine which image to use based on level
    // Assuming the user saves the city image as bg_city.png and temple as bg_temple.png
    String imagePath = level >= 3 ? 'bg_temple.png' : 'bg_city.png';
    
    try {
      parallax = await game.loadParallax(
        [ParallaxImageData(imagePath)],
        baseVelocity: Vector2(game.currentSpeed, 0),
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
    
    if (game.gameState == GameState.playing) {
      // Check if level changed and update background image
      if (_currentLevel != game.levelManager.level) {
        _currentLevel = game.levelManager.level;
        _loadParallaxForLevel(_currentLevel);
      }
      
      parallax?.baseVelocity = Vector2(game.currentSpeed * 2, 0); // Background moves slightly faster relative to Forge2d space depending on desired effect
    } else {
      parallax?.baseVelocity = Vector2.zero();
    }
  }
}

class Ground extends BodyComponent<OrbitGame> {
  @override
  Body createBody() {
    final shape = PolygonShape()
      ..setAsBoxXY(game.camera.visibleWorldRect.width * 2, 2.0);

    final fixtureDef = FixtureDef(
      shape, 
      friction: 0.3,
      userData: this,
    );

    final bodyDef = BodyDef(
      position: Vector2(0, game.camera.visibleWorldRect.height - 2),
      type: BodyType.static,
    );

    return world.createBody(bodyDef)..createFixture(fixtureDef);
  }
}
