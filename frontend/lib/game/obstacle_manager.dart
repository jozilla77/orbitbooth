import 'package:flame/components.dart';
import 'package:flame_forge2d/flame_forge2d.dart';
import 'dart:math';
import 'orbit_game.dart';

class Pipe extends BodyComponent<OrbitGame> {
  final Vector2 position;
  final Vector2 size;
  final bool isTop;

  Pipe({required this.position, required this.size, required this.isTop});

  @override
  Body createBody() {
    final shape = PolygonShape()
      ..setAsBoxXY(size.x / 2, size.y / 2);

    final fixtureDef = FixtureDef(
      shape,
      userData: this, // Used for collision
    );

    final bodyDef = BodyDef(
      position: position,
      type: BodyType.kinematic,
    );

    return world.createBody(bodyDef)..createFixture(fixtureDef);
  }

  @override
  void update(double dt) {
    super.update(dt);
    // Move left based on game speed
    body.linearVelocity = Vector2(-game.currentSpeed, 0);

    // Remove if off screen
    if (body.position.x < -20) {
      removeFromParent();
    }
  }
}

class ScoreSensor extends BodyComponent<OrbitGame> {
  final Vector2 position;
  final Vector2 size;
  bool scored = false;

  ScoreSensor({required this.position, required this.size});

  @override
  Body createBody() {
    final shape = PolygonShape()
      ..setAsBoxXY(size.x / 2, size.y / 2);

    final fixtureDef = FixtureDef(
      shape,
      isSensor: true, // Only detects overlap, no physical response
      userData: this,
    );

    final bodyDef = BodyDef(
      position: position,
      type: BodyType.kinematic,
    );

    return world.createBody(bodyDef)..createFixture(fixtureDef);
  }

  @override
  void update(double dt) {
    super.update(dt);
    body.linearVelocity = Vector2(-game.currentSpeed, 0);

    if (body.position.x < -20) {
      removeFromParent();
    }
  }
}

class ObstacleManager extends Component with HasGameReference<OrbitGame> {
  double spawnTimer = 0;
  final Random _random = Random();

  void reset() {
    spawnTimer = 0;
    // Remove all existing pipes and sensors
    game.world.children.whereType<Pipe>().forEach((p) => p.removeFromParent());
    game.world.children.whereType<ScoreSensor>().forEach((s) => s.removeFromParent());
  }

  @override
  void update(double dt) {
    super.update(dt);
    
    if (game.gameState != GameState.playing) return;

    spawnTimer += dt;
    
    // Spawn rate scales with game speed
    double spawnInterval = 30.0 / game.currentSpeed;
    
    if (spawnTimer >= spawnInterval) {
      spawnTimer = 0;
      _spawnObstacle();
    }
  }

  void _spawnObstacle() {
    // Screen height is roughly 100 units in Forge2D space based on our camera setup
    final screenHeight = game.camera.visibleWorldRect.height;
    final screenWidth = game.camera.visibleWorldRect.width;
    
    final spawnX = screenWidth / 2 + 10;
    
    // Gap size gets smaller as level increases
    double gapSize = 30.0;
    if (game.levelManager.level == 2) gapSize = 25.0;
    if (game.levelManager.level == 3) gapSize = 20.0;

    // Randomize the y position of the gap
    double minY = 20.0;
    double maxY = screenHeight - 20.0 - gapSize;
    double gapTopY = minY + _random.nextDouble() * (maxY - minY);
    double gapBottomY = gapTopY + gapSize;

    final pipeWidth = 10.0;

    // Top Pipe
    final topPipeHeight = gapTopY;
    game.world.add(Pipe(
      position: Vector2(spawnX, topPipeHeight / 2),
      size: Vector2(pipeWidth, topPipeHeight),
      isTop: true,
    ));

    // Bottom Pipe
    final bottomPipeHeight = screenHeight - gapBottomY;
    game.world.add(Pipe(
      position: Vector2(spawnX, screenHeight - bottomPipeHeight / 2),
      size: Vector2(pipeWidth, bottomPipeHeight),
      isTop: false,
    ));

    // Score Sensor in the gap
    game.world.add(ScoreSensor(
      position: Vector2(spawnX, gapTopY + gapSize / 2),
      size: Vector2(pipeWidth, gapSize),
    ));
  }
}
