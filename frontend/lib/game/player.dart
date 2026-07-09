import 'package:flame/components.dart';
import 'package:flame_forge2d/flame_forge2d.dart';
import 'orbit_game.dart';
import 'obstacle_manager.dart';

class Player extends BodyComponent<OrbitGame> with ContactCallbacks {
  late SpriteComponent sprite;
  final Vector2 startPosition;

  Player(this.startPosition);

  @override
  Future<void> onLoad() async {
    await super.onLoad();
    
    sprite = SpriteComponent()
      ..sprite = await game.loadSprite('character.png')
      ..size = Vector2(8, 8)
      ..anchor = Anchor.center;
      
    add(sprite);
  }

  @override
  Body createBody() {
    final shape = CircleShape()..radius = 3.5;
    
    final fixtureDef = FixtureDef(
      shape, 
      friction: 0.3,
      restitution: 0.2, // slightly bouncy
      density: 1.0,
      userData: this, // reference for collision detection
    );

    final bodyDef = BodyDef(
      position: startPosition,
      type: BodyType.dynamic,
      fixedRotation: true, // keep the sprite upright
    );

    return world.createBody(bodyDef)..createFixture(fixtureDef);
  }

  @override
  void beginContact(Object other, Contact contact) {
    if (other is Ground || other is Pipe) {
      if (game.gameState == GameState.playing) {
        game.gameOver();
      }
    } else if (other is ScoreSensor) {
      if (game.gameState == GameState.playing && !other.scored) {
        other.scored = true;
        game.levelManager.incrementScore();
      }
    }
  }

  void flap() {
    // Reset vertical velocity
    body.linearVelocity = Vector2(body.linearVelocity.x, 0);
    // Apply upward impulse
    body.applyLinearImpulse(Vector2(0, -40));
  }

  void reset(Vector2 position) {
    body.setTransform(position, 0);
    body.linearVelocity = Vector2.zero();
    body.angularVelocity = 0;
  }
}
