import 'package:shared_preferences/shared_preferences.dart';
import 'package:flutter/foundation.dart';

class LevelManager extends ChangeNotifier {
  int _score = 0;
  int _highScore = 0;
  int _level = 1;
  double _currentSpeed = 15.0; // Base speed

  int get score => _score;
  int get highScore => _highScore;
  int get level => _level;
  double get currentSpeed => _currentSpeed;

  LevelManager() {
    _loadHighScore();
  }

  Future<void> _loadHighScore() async {
    final prefs = await SharedPreferences.getInstance();
    _highScore = prefs.getInt('highScore') ?? 0;
    notifyListeners();
  }

  Future<void> _saveHighScore(int newHighScore) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setInt('highScore', newHighScore);
  }

  void reset() {
    _score = 0;
    _level = 1;
    _currentSpeed = 15.0;
    notifyListeners();
  }

  void incrementScore() {
    _score++;
    
    // Check level progression
    if (_score == 10 && _level == 1) {
      _level = 2;
      _currentSpeed = 30.0; // 2x faster
    } else if (_score == 25 && _level == 2) {
      _level = 3;
      _currentSpeed = 40.0; // Hardest speed
    }

    if (_score > _highScore) {
      _highScore = _score;
      _saveHighScore(_highScore);
    }
    
    notifyListeners();
  }
}
