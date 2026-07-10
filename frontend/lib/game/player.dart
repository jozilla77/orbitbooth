import 'package:flame/components.dart';
import 'package:flame/collisions.dart';
import 'package:flutter/painting.dart';
import 'dart:ui';
import 'dart:math';
import 'orbit_game.dart';
import 'obstacle_manager.dart';

class Player extends SpriteComponent with CollisionCallbacks, HasGameRef<OrbitGame> {
  Vector2 velocity = Vector2.zero();
  final Vector2 startPosition;
  double _bounceTimer = 0;

  Player(this.startPosition) : super(
    position: startPosition,
    size: Vector2(50, 50),
    anchor: Anchor.center,
  );

  @override
  Future<void> onLoad() async {
    await super.onLoad();
    try {
      sprite = await gameRef.loadSprite('character.png');
    } catch (e) {
      print('Warning: character.png not found');
    }
    // Add hitbox slightly smaller than sprite for fairer gameplay
    add(RectangleHitbox(size: Vector2(30, 30), position: Vector2(10, 10)));
  }

  @override
  void render(Canvas canvas) {
    super.render(canvas);
    // Fallback if sprite fails to load
    if (sprite == null) {
      final paint = Paint()..color = const Color(0xFFFF0000); // Red square
      canvas.drawRect(size.toRect(), paint);
    }
  }

  @override
  void update(double dt) {
    super.update(dt);
    
    if (gameRef.gameState == GameState.playing) {
      velocity.y += gameRef.gravity * dt;
      position.y += velocity.y * dt;
      
      // Fall off bottom or fly off top
      if (position.y > gameRef.camera.viewport.size.y + size.y || position.y < -size.y) {
        gameRef.gameOver();
      }
      
      // Tilt character based on velocity
      angle = (velocity.y * 0.001).clamp(-0.5, 0.5);

    } else if (gameRef.gameState == GameState.ready) {
      _bounceTimer += dt * 5;
      position.y = startPosition.y + (sin(_bounceTimer) * 10);
      angle = 0;
    }
  }

  @override
  void onCollisionStart(Set<Vector2> intersectionPoints, PositionComponent other) {
    super.onCollisionStart(intersectionPoints, other);
    
    if (gameRef.gameState != GameState.playing) return;
    
    if (other is Ground || other is Pipe) {
      gameRef.gameOver();
    } else if (other is ScoreSensor && !other.scored) {
      other.scored = true;
      gameRef.levelManager.incrementScore();
    }
  }

  void flap() {
    velocity.y = gameRef.jumpStrength;
  }

  void resetPlayer(Vector2 newPosition) {
    position = newPosition;
    velocity = Vector2.zero();
    angle = 0;
    _bounceTimer = 0;
  }
}
