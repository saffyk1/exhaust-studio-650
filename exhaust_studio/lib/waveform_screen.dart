import 'dart:async';
import 'dart:math';
import 'package:flutter/material.dart';
import 'package:ffmpeg_kit_flutter_video/ffmpeg_kit.dart';
import 'package:ffmpeg_kit_flutter_video/ffmpeg_session.dart';
import 'package:ffmpeg_kit_flutter_video/return_code.dart';
import 'package:ffmpeg_kit_flutter_video/log.dart' as fflog;

// ─────────────────────────────────────────────────────────────────────────────
// WaveformScreen
//
// Wraps an active FFmpegSession and streams its log output to drive an
// animated bar-graph waveform display. Each log line is hashed into a
// pseudo-amplitude value so the bars react in real time while FFmpeg works.
// ─────────────────────────────────────────────────────────────────────────────

class WaveformScreen extends StatefulWidget {
  final String inputPath;
  final String outputPath;
  final String ffmpegCommand;
  final VoidCallback onComplete;
  final void Function(String error) onError;

  const WaveformScreen({
    super.key,
    required this.inputPath,
    required this.outputPath,
    required this.ffmpegCommand,
    required this.onComplete,
    required this.onError,
  });

  @override
  State<WaveformScreen> createState() => _WaveformScreenState();
}

class _WaveformScreenState extends State<WaveformScreen>
    with SingleTickerProviderStateMixin {
  static const int _barCount = 32;

  // Current amplitude for each bar (0.0–1.0)
  final List<double> _bars = List.filled(_barCount, 0.02);

  // Running progress derived from FFmpeg log lines (0.0–1.0)
  double _progress = 0.0;

  // Latest FFmpeg log line shown beneath the bars
  String _logLine = 'Initialising session…';

  // Phase counter used to animate idle bars
  double _idlePhase = 0.0;

  FFmpegSession? _session;
  bool _isRunning = false;
  bool _isDone = false;

  late AnimationController _ticker;
  final Random _rng = Random();

  @override
  void initState() {
    super.initState();
    _ticker = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 80),
    )..addListener(_onTick)
     ..repeat();

    _startSession();
  }

  @override
  void dispose() {
    _ticker.dispose();
    super.dispose();
  }

  // ── Idle animation tick ───────────────────────────────────────────────────

  void _onTick() {
    if (!_isRunning || !mounted) return;
    setState(() {
      _idlePhase += 0.12;
      // When no real log data is coming in, softly oscillate bars
      for (int i = 0; i < _barCount; i++) {
        final wave = (sin(_idlePhase + i * 0.4) + 1) / 2; // 0–1
        // Blend toward idle wave slowly so bars don't snap around
        _bars[i] = _bars[i] * 0.85 + wave * 0.15 * 0.4 + 0.02;
      }
    });
  }

  // ── Parse a log line → drive bar amplitudes ───────────────────────────────

  void _onLog(fflog.Log log) {
    final message = log.getMessage() ?? '';
    if (message.isEmpty) return;

    // Extract time= progress from FFmpeg stats lines
    // e.g. "frame=  120 fps= 60 ... time=00:00:04.80 ..."
    final timeMatch = RegExp(r'time=(\d+):(\d+):([\d.]+)').firstMatch(message);
    if (timeMatch != null) {
      final h = int.parse(timeMatch.group(1)!);
      final m = int.parse(timeMatch.group(2)!);
      final s = double.parse(timeMatch.group(3)!);
      final totalSecs = h * 3600 + m * 60 + s;
      // We don't know duration, so use a saturating ramp — progress caps at 0.98
      // until the session actually completes.
      setState(() {
        _progress = min(0.98, totalSecs / 120.0); // assumes ≤120s clip; safe cap
        _logLine = message.trim().replaceAll(RegExp(r'\s+'), ' ');
      });
    }

    // Use the message hash to seed a burst of bar amplitudes
    _injectLogEnergy(message);
  }

  void _injectLogEnergy(String message) {
    if (!mounted) return;
    // Map the message string into bar energy spikes
    final bytes = message.codeUnits;
    setState(() {
      for (int i = 0; i < bytes.length && i < _barCount; i++) {
        final energy = (bytes[i] % 100) / 100.0;
        final barIdx = (i * _barCount ~/ max(bytes.length, 1)) % _barCount;
        _bars[barIdx] = max(_bars[barIdx], energy * 0.9 + 0.08);
      }
      // Decay all bars slightly each log event to prevent them sticking high
      for (int i = 0; i < _barCount; i++) {
        _bars[i] *= 0.92;
        _bars[i] = _bars[i].clamp(0.02, 1.0);
      }
    });
  }

  // ── Start FFmpeg session ───────────────────────────────────────────────────

  Future<void> _startSession() async {
    setState(() => _isRunning = true);

    _session = await FFmpegKit.executeAsync(
      widget.ffmpegCommand,
      (session) async {
        // Completion callback
        final rc = await session.getReturnCode();
        if (!mounted) return;
        setState(() {
          _isRunning = false;
          _isDone = true;
          _progress = 1.0;
        });
        _ticker.stop();

        if (ReturnCode.isSuccess(rc)) {
          widget.onComplete();
        } else {
          final logs = await session.getAllLogsAsString();
          widget.onError(logs ?? 'Unknown FFmpeg error');
        }
      },
      (log) => _onLog(log),  // log callback
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // BUILD
  // ─────────────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0A0A0A),
      appBar: AppBar(
        backgroundColor: const Color(0xFF0D0D0D),
        leading: IconButton(
          icon: const Icon(Icons.close, color: Color(0xFF555555)),
          onPressed: _isDone ? () => Navigator.pop(context) : null,
          tooltip: 'Close (available after processing)',
        ),
        title: Row(
          children: [
            const Icon(Icons.graphic_eq, color: Color(0xFFFF6B00), size: 18),
            const SizedBox(width: 8),
            const Text(
              'PROCESSING',
              style: TextStyle(
                fontFamily: 'monospace',
                fontSize: 14,
                fontWeight: FontWeight.w700,
                letterSpacing: 2,
                color: Color(0xFFFF6B00),
              ),
            ),
          ],
        ),
      ),
      body: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const SizedBox(height: 12),
            _buildStatusLabel(),
            const SizedBox(height: 40),
            _buildWaveform(),
            const SizedBox(height: 32),
            _buildProgressBar(),
            const SizedBox(height: 20),
            _buildLogReadout(),
            const Spacer(),
            if (_isDone) _buildDoneButton(),
          ],
        ),
      ),
    );
  }

  // ── Status label ──────────────────────────────────────────────────────────

  Widget _buildStatusLabel() {
    final label = _isDone
        ? 'AUDIO MASTERED'
        : _isRunning
            ? 'MASTERING ENGINE AUDIO'
            : 'STARTING…';
    final color = _isDone
        ? const Color(0xFF00E676)
        : const Color(0xFFFF6B00);

    return Row(
      children: [
        AnimatedContainer(
          duration: const Duration(milliseconds: 400),
          width: 8,
          height: 8,
          decoration: BoxDecoration(
            color: color,
            shape: BoxShape.circle,
            boxShadow: _isRunning && !_isDone
                ? [BoxShadow(color: color.withOpacity(0.6), blurRadius: 8, spreadRadius: 2)]
                : [],
          ),
        ),
        const SizedBox(width: 10),
        Text(
          label,
          style: TextStyle(
            fontFamily: 'monospace',
            fontSize: 11,
            fontWeight: FontWeight.w800,
            letterSpacing: 2.5,
            color: color,
          ),
        ),
      ],
    );
  }

  // ── Waveform bar graph ────────────────────────────────────────────────────

  Widget _buildWaveform() {
    return SizedBox(
      height: 140,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: List.generate(_barCount, (i) {
          final amp = _bars[i].clamp(0.02, 1.0);
          // Color gradient: low bars are dim grey, high bars glow orange→amber
          final t = amp;
          final barColor = Color.lerp(
            const Color(0xFF2A2A2A),
            amp > 0.7 ? const Color(0xFFFFAA00) : const Color(0xFFFF6B00),
            t,
          )!;

          return Expanded(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 1.5),
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 60),
                height: 140 * amp,
                decoration: BoxDecoration(
                  color: barColor,
                  borderRadius: const BorderRadius.vertical(top: Radius.circular(2)),
                  boxShadow: amp > 0.6
                      ? [BoxShadow(color: barColor.withOpacity(0.4), blurRadius: 6, spreadRadius: 1)]
                      : [],
                ),
              ),
            ),
          );
        }),
      ),
    );
  }

  // ── Progress bar ──────────────────────────────────────────────────────────

  Widget _buildProgressBar() {
    final pct = (_progress * 100).toStringAsFixed(0);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            const Text(
              'PIPELINE PROGRESS',
              style: TextStyle(
                fontFamily: 'monospace',
                fontSize: 9,
                letterSpacing: 2,
                color: Color(0xFF444444),
              ),
            ),
            Text(
              '$pct%',
              style: const TextStyle(
                fontFamily: 'monospace',
                fontSize: 9,
                letterSpacing: 1,
                color: Color(0xFFFF6B00),
              ),
            ),
          ],
        ),
        const SizedBox(height: 8),
        ClipRRect(
          borderRadius: BorderRadius.circular(2),
          child: LinearProgressIndicator(
            value: _progress,
            minHeight: 3,
            backgroundColor: const Color(0xFF1E1E1E),
            valueColor: AlwaysStoppedAnimation<Color>(
              _isDone ? const Color(0xFF00E676) : const Color(0xFFFF6B00),
            ),
          ),
        ),
      ],
    );
  }

  // ── Log readout ───────────────────────────────────────────────────────────

  Widget _buildLogReadout() {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color(0xFF0F0F0F),
        border: Border.all(color: const Color(0xFF1E1E1E)),
        borderRadius: BorderRadius.circular(4),
      ),
      child: Text(
        _logLine,
        maxLines: 2,
        overflow: TextOverflow.ellipsis,
        style: const TextStyle(
          fontFamily: 'monospace',
          fontSize: 9,
          color: Color(0xFF3A3A3A),
          height: 1.5,
          letterSpacing: 0.3,
        ),
      ),
    );
  }

  // ── Done button ───────────────────────────────────────────────────────────

  Widget _buildDoneButton() {
    return SizedBox(
      width: double.infinity,
      child: ElevatedButton.icon(
        onPressed: () => Navigator.pop(context),
        icon: const Icon(Icons.check, size: 18),
        label: const Text('DONE — RETURN TO STUDIO'),
        style: ElevatedButton.styleFrom(
          backgroundColor: const Color(0xFF00E676),
          foregroundColor: Colors.black,
          minimumSize: const Size.fromHeight(54),
          shape: const RoundedRectangleBorder(
            borderRadius: BorderRadius.all(Radius.circular(4)),
          ),
          textStyle: const TextStyle(
            fontFamily: 'monospace',
            fontSize: 13,
            fontWeight: FontWeight.w800,
            letterSpacing: 1.6,
          ),
        ),
      ),
    );
  }
}
