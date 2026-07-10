import 'package:flame/components.dart';
import 'package:flame/collisions.dart';
import 'package:flutter/painting.dart';
import 'dart:ui';
import 'dart:math';
import 'orbit_game.dart';

class Pipe extends PositionComponent with HasGameRef<OrbitGame> {
  final bool isTop;

  Pipe({required Vector2 position, required Vector2 size, required this.isTop}) : super(
    position: position,
    size: size,
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
    final rect = size.toRect();
    final paint = Paint()
      ..color = const Color(0xFF2ECC71) // Base green
      ..style = PaintingStyle.fill;
    canvas.drawRect(rect, paint);
    
    // Draw pipe borders
    final borderPaint = Paint()
      ..color = const Color(0xFF27AE60)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 4.0;
    canvas.drawRect(rect, borderPaint);
    
    // Draw pipe cap (top or bottom depending on isTop)
    final capRect = isTop 
        ? Rect.fromLTWH(-5, size.y - 30, size.x + 10, 30)
        : Rect.fromLTWH(-5, 0, size.x + 10, 30);
    canvas.drawRect(capRect, paint);
    canvas.drawRect(capRect, borderPaint);
  }

  @override
  void update(double dt) {
    super.update(dt);
    if (gameRef.gameState == GameState.playing) {
      position.x -= gameRef.currentSpeed * dt;
      if (position.x + size.x < 0) {
        removeFromParent();
      }
    }
  }
}

class ScoreSensor extends PositionComponent with HasGameRef<OrbitGame>, CollisionCallbacks {
  bool scored = false;

  ScoreSensor({required Vector2 position, required Vector2 size}) : super(
    position: position,
    size: size,
    anchor: Anchor.center,
  );

  @override
  Future<void> onLoad() async {
    await super.onLoad();
    // isSolid = false so it doesn't resolve collisions physically, just triggers callback
    add(RectangleHitbox()..isSolid = false);
  }

  @override
  void update(double dt) {
    super.update(dt);
    if (gameRef.gameState == GameState.playing) {
      position.x -= gameRef.currentSpeed * dt;
      if (position.x + size.x < 0) {
        removeFromParent();
      }
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
    
    // Spawn rate scales with game speed (e.g. spawn every 350 pixels)
    double spawnInterval = 350.0 / game.currentSpeed; 
    
    if (spawnTimer >= spawnInterval) {
      spawnTimer = 0;
      _spawnObstacle();
    }
  }

  void _spawnObstacle() {
    // Screen is fixed at 800x600 in pixels
    final screenHeight = 600.0;
    final screenWidth = 800.0;
    
    // Spawn just offscreen to the right
    final spawnX = screenWidth + 50;
    
    // Gap size gets smaller as level increases
    double gapSize = 250.0;
    if (game.levelManager.level == 2) gapSize = 200.0;
    if (game.levelManager.level == 3) gapSize = 150.0;

    // Randomize the y position of the gap
    double minY = 100.0;
    double maxY = screenHeight - 100.0 - gapSize;
    double gapTopY = minY + _random.nextDouble() * (maxY - minY);
    double gapBottomY = gapTopY + gapSize;

    final pipeWidth = 80.0;

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
      position: Vector2(spawnX, gapBottomY + bottomPipeHeight / 2),
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
