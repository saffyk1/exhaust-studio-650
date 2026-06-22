import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:image_picker/image_picker.dart';
import 'package:video_player/video_player.dart';
import 'package:ffmpeg_kit_flutter_video/ffmpeg_kit.dart';
import 'package:ffmpeg_kit_flutter_video/return_code.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:path_provider/path_provider.dart';
import 'package:path/path.dart' as p;
import 'package:gal/gal.dart';
import 'waveform_screen.dart';

// ─────────────────────────────────────────────────────────────────────────────
// Entry point
// ─────────────────────────────────────────────────────────────────────────────
void main() {
  WidgetsFlutterBinding.ensureInitialized();
  SystemChrome.setPreferredOrientations([DeviceOrientation.portraitUp]);
  SystemChrome.setSystemUIOverlayStyle(
    const SystemUiOverlayStyle(
      statusBarColor: Colors.transparent,
      statusBarIconBrightness: Brightness.light,
    ),
  );
  runApp(const ExhaustStudioApp());
}

// ─────────────────────────────────────────────────────────────────────────────
// App root
// ─────────────────────────────────────────────────────────────────────────────
class ExhaustStudioApp extends StatelessWidget {
  const ExhaustStudioApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'ExhaustStudio 650',
      debugShowCheckedModeBanner: false,
      theme: _buildTheme(),
      home: const HomeScreen(),
    );
  }

  ThemeData _buildTheme() {
    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.dark,
      scaffoldBackgroundColor: const Color(0xFF141414),
      colorScheme: ColorScheme.dark(
        primary: const Color(0xFFFF6B00),
        secondary: const Color(0xFFFFAA00),
        surface: const Color(0xFF1E1E1E),
        onSurface: const Color(0xFFE8E8E8),
      ),
      appBarTheme: const AppBarTheme(
        backgroundColor: Color(0xFF0D0D0D),
        foregroundColor: Color(0xFFE8E8E8),
        elevation: 0,
        centerTitle: false,
        titleTextStyle: TextStyle(
          fontFamily: 'monospace',
          fontSize: 18,
          fontWeight: FontWeight.w700,
          letterSpacing: 1.4,
          color: Color(0xFFFF6B00),
        ),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: const Color(0xFFFF6B00),
          foregroundColor: Colors.black,
          minimumSize: const Size.fromHeight(56),
          shape: const RoundedRectangleBorder(
            borderRadius: BorderRadius.all(Radius.circular(4)),
          ),
          textStyle: const TextStyle(
            fontFamily: 'monospace',
            fontSize: 15,
            fontWeight: FontWeight.w800,
            letterSpacing: 1.6,
          ),
        ),
      ),
      sliderTheme: SliderThemeData(
        activeTrackColor: const Color(0xFFFF6B00),
        inactiveTrackColor: const Color(0xFF3A3A3A),
        thumbColor: const Color(0xFFFFAA00),
        overlayColor: const Color(0x33FF6B00),
        trackHeight: 3,
        thumbShape: const RoundSliderThumbShape(enabledThumbRadius: 9),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Home Screen
// ─────────────────────────────────────────────────────────────────────────────
class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> with TickerProviderStateMixin {
  // ── UI state ────────────────────────────────────────────────────────────────
  File? _videoFile;
  VideoPlayerController? _videoController;
  bool _isLoading = false;
  String _loadingMessage = 'Mastering Engine Audio...';
  String? _statusMessage;
  bool _statusIsError = false;
  bool _manualExpanded = false;

  // ── Quick-access sliders (0.0–1.0) ──────────────────────────────────────────
  // Moving these updates the manual params below in lockstep.
  double _noiseCleanup = 0.5;
  double _exhaustDepth = 0.5;

  // ── Manual filter parameters (editable individually) ────────────────────────
  // Defaults match the original hardcoded values.
  int    _hpfHz       = 120;   // highpass=f=
  int    _lpfHz       = 6500;  // lowpass=f=
  double _eq1GainDb   = 6.0;   // equalizer f=200 g=
  double _eq2GainDb   = 3.0;   // equalizer f=2500 g=
  double _compThreshDb = -12.0; // acompressor threshold
  double _compRatio   = 4.0;   // acompressor ratio
  double _volumeDb    = 2.0;   // volume
  double _limiterDb   = -1.0;  // alimiter limit (≤0)

  final ImagePicker _picker = ImagePicker();
  late AnimationController _pulseController;
  late Animation<double> _pulseAnimation;

  @override
  void initState() {
    super.initState();
    _pulseController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 900),
    )..repeat(reverse: true);
    _pulseAnimation = Tween<double>(begin: 0.7, end: 1.0).animate(
      CurvedAnimation(parent: _pulseController, curve: Curves.easeInOut),
    );
  }

  @override
  void dispose() {
    _videoController?.dispose();
    _pulseController.dispose();
    super.dispose();
  }

  // ── Filter chain ─────────────────────────────────────────────────────────────
  // Built entirely from the manual params so both quick sliders and manual
  // controls produce identical FFmpeg commands.
  String get _filterChain =>
      'highpass=f=$_hpfHz, '
      'lowpass=f=$_lpfHz, '
      'equalizer=f=200:width_type=h:width=50:g=${_eq1GainDb.toStringAsFixed(1)}, '
      'equalizer=f=2500:width_type=h:width=200:g=${_eq2GainDb.toStringAsFixed(1)}, '
      'acompressor=threshold=${_compThreshDb.toStringAsFixed(0)}dB:ratio=${_compRatio.toStringAsFixed(1)}:attack=5:release=50, '
      'volume=volume=${_volumeDb.toStringAsFixed(1)}dB, '
      'alimiter=limit=${_limiterDb.toStringAsFixed(1)}dB';

  // ── Quick-slider sync helpers ─────────────────────────────────────────────────
  void _onNoiseChanged(double v) => setState(() {
    _noiseCleanup = v;
    _hpfHz = (60 + v * 120).round();
    _lpfHz = (9000 - v * 5000).round();
  });

  void _onDepthChanged(double v) => setState(() {
    _exhaustDepth = v;
    _eq1GainDb = v * 12.0;
  });

  // ── Permissions ───────────────────────────────────────────────────────────────
  Future<bool> _ensurePermissions() async {
    PermissionStatus status;
    if (Platform.isAndroid) {
      status = await Permission.videos.request();
      if (!status.isGranted) status = await Permission.storage.request();
    } else {
      status = await Permission.photos.request();
    }
    return status.isGranted;
  }

  // ── Video picking ─────────────────────────────────────────────────────────────
  Future<void> _pickVideo() async {
    if (_isLoading) return;
    final granted = await _ensurePermissions();
    if (!granted) {
      _showStatus('Storage permission denied. Please allow access in Settings.', isError: true);
      return;
    }
    final XFile? picked = await _picker.pickVideo(source: ImageSource.gallery);
    if (picked == null) return;
    final file = File(picked.path);
    await _initVideoController(file);
    setState(() { _videoFile = file; _statusMessage = null; });
  }

  Future<void> _initVideoController(File file) async {
    await _videoController?.dispose();
    final ctrl = VideoPlayerController.file(file);
    await ctrl.initialize();
    ctrl.setLooping(true);
    setState(() => _videoController = ctrl);
  }

  // ── FFmpeg processing ─────────────────────────────────────────────────────────
  Future<void> _processVideo() async {
    if (_videoFile == null || _isLoading) return;
    final cacheDir = await getTemporaryDirectory();
    final timestamp = DateTime.now().millisecondsSinceEpoch;
    final tempOutput = p.join(cacheDir.path, 'exhaust_studio_$timestamp.mp4');
    final inputPath = _videoFile!.path;
    final filter = _filterChain;
    final command = '-y -i "$inputPath" -c:v copy -af "$filter" "$tempOutput"';

    debugPrint('[ExhaustStudio] Running FFmpeg: $command');
    if (!mounted) return;

    await Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => WaveformScreen(
          inputPath: inputPath,
          outputPath: tempOutput,
          ffmpegCommand: command,
          onComplete: () async {
            try {
              final savedPath = await _saveToGallery(tempOutput, timestamp);
              try { File(tempOutput).deleteSync(); } catch (_) {}
              if (mounted) {
                Navigator.pop(context);
                _showSuccessSheet(savedPath);
                setState(() {
                  _statusMessage = 'Saved → $savedPath';
                  _statusIsError = false;
                });
              }
            } catch (e) {
              if (mounted) {
                Navigator.pop(context);
                _showStatus('Gallery save failed: $e', isError: true);
              }
            }
          },
          onError: (err) {
            debugPrint('[ExhaustStudio] FFmpeg failed:\n$err');
            if (mounted) {
              Navigator.pop(context);
              setState(() { _statusMessage = err; _statusIsError = true; });
              _showStatus('Processing failed. Check logs.', isError: true);
            }
          },
        ),
      ),
    );
  }

  Future<String> _saveToGallery(String tempPath, int timestamp) async {
    final hasAccess = await Gal.hasAccess(toAlbum: true);
    if (!hasAccess) {
      final granted = await Gal.requestAccess(toAlbum: true);
      if (!granted) throw Exception('Gallery access denied. Please allow Photos / Media access in Settings.');
    }
    await Gal.putVideo(tempPath, album: 'ExhaustStudio');
    return 'Gallery › ExhaustStudio › ExhaustStudio_$timestamp.mp4';
  }

  // ── UI helpers ────────────────────────────────────────────────────────────────
  void _showStatus(String msg, {required bool isError}) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text(msg, style: const TextStyle(fontFamily: 'monospace')),
      backgroundColor: isError ? Colors.red[800] : const Color(0xFF2A2A2A),
      behavior: SnackBarBehavior.floating,
      margin: const EdgeInsets.all(16),
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.all(Radius.circular(4))),
    ));
  }

  void _showSuccessSheet(String path) {
    showModalBottomSheet(
      context: context,
      backgroundColor: const Color(0xFF1A1A1A),
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(12))),
      builder: (_) => Padding(
        padding: const EdgeInsets.fromLTRB(24, 20, 24, 36),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(children: const [
              Icon(Icons.check_circle, color: Color(0xFF00E676), size: 22),
              SizedBox(width: 10),
              Text('AUDIO MASTERED', style: TextStyle(
                fontFamily: 'monospace', fontWeight: FontWeight.w800,
                fontSize: 14, letterSpacing: 2, color: Color(0xFF00E676),
              )),
            ]),
            const SizedBox(height: 14),
            const Text('Your video has been saved to the Gallery under "ExhaustStudio".',
              style: TextStyle(color: Color(0xFFB0B0B0), height: 1.5)),
            const SizedBox(height: 8),
            Text(p.basename(path), style: const TextStyle(
              fontFamily: 'monospace', fontSize: 12, color: Color(0xFF606060))),
            const SizedBox(height: 20),
            ElevatedButton(onPressed: () => Navigator.pop(context), child: const Text('DONE')),
          ],
        ),
      ),
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // BUILD
  // ─────────────────────────────────────────────────────────────────────────────
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Row(children: [
          const Icon(Icons.graphic_eq, color: Color(0xFFFF6B00), size: 20),
          const SizedBox(width: 10),
          const Text('EXHAUST STUDIO'),
          const SizedBox(width: 6),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
            decoration: BoxDecoration(
              border: Border.all(color: const Color(0xFFFF6B00), width: 1),
              borderRadius: BorderRadius.circular(2),
            ),
            child: const Text('650', style: TextStyle(
              fontSize: 11, fontWeight: FontWeight.w600,
              letterSpacing: 1, color: Color(0xFFFF6B00),
            )),
          ),
        ]),
        actions: const [
          Padding(
            padding: EdgeInsets.only(right: 16),
            child: Icon(Icons.speed, color: Color(0xFF444444), size: 20),
          ),
        ],
      ),
      body: Stack(children: [
        SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 100),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _buildVideoSection(),
              const SizedBox(height: 28),
              _buildDividerLabel('TUNING'),
              const SizedBox(height: 16),
              _buildQuickSliders(),
              const SizedBox(height: 20),
              _buildManualTuning(),
              const SizedBox(height: 28),
              _buildDividerLabel('PIPELINE'),
              const SizedBox(height: 12),
              _buildPipelineReadout(),
              const SizedBox(height: 28),
              _buildEnhanceButton(),
            ],
          ),
        ),
        if (_isLoading) _buildLoadingOverlay(),
      ]),
    );
  }

  // ── Video section ─────────────────────────────────────────────────────────────
  Widget _buildVideoSection() {
    final hasVideo = _videoController != null && _videoController!.value.isInitialized;
    return GestureDetector(
      onTap: hasVideo ? null : _pickVideo,
      child: AspectRatio(
        aspectRatio: 16 / 9,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 300),
          decoration: BoxDecoration(
            color: const Color(0xFF1A1A1A),
            border: Border.all(
              color: hasVideo ? const Color(0xFF333333) : const Color(0xFF2E2E2E),
              width: 1.5,
            ),
            borderRadius: BorderRadius.circular(6),
          ),
          child: hasVideo ? _buildVideoPlayer() : _buildEmptyVideoPlaceholder(),
        ),
      ),
    );
  }

  Widget _buildEmptyVideoPlaceholder() {
    return Column(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        Container(
          width: 60, height: 60,
          decoration: BoxDecoration(
            border: Border.all(color: const Color(0xFF333333), width: 1.5),
            shape: BoxShape.circle,
          ),
          child: const Icon(Icons.add, color: Color(0xFF555555), size: 28),
        ),
        const SizedBox(height: 14),
        const Text('Upload Ride Video', style: TextStyle(
          color: Color(0xFF555555), fontFamily: 'monospace',
          fontSize: 13, letterSpacing: 1.2,
        )),
        const SizedBox(height: 6),
        const Text('tap to select from gallery', style: TextStyle(color: Color(0xFF383838), fontSize: 11)),
      ],
    );
  }

  Widget _buildVideoPlayer() {
    return ClipRRect(
      borderRadius: BorderRadius.circular(5),
      child: Stack(
        alignment: Alignment.center,
        children: [
          VideoPlayer(_videoController!),
          GestureDetector(
            onTap: () => setState(() {
              _videoController!.value.isPlaying
                  ? _videoController!.pause()
                  : _videoController!.play();
            }),
            child: AnimatedOpacity(
              opacity: _videoController!.value.isPlaying ? 0.0 : 1.0,
              duration: const Duration(milliseconds: 200),
              child: Container(
                width: 52, height: 52,
                decoration: BoxDecoration(
                  color: Colors.black.withOpacity(0.65), shape: BoxShape.circle),
                child: const Icon(Icons.play_arrow, color: Colors.white, size: 30),
              ),
            ),
          ),
          Positioned(
            top: 8, right: 8,
            child: GestureDetector(
              onTap: _pickVideo,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: Colors.black.withOpacity(0.7),
                  borderRadius: BorderRadius.circular(3),
                  border: Border.all(color: const Color(0xFF333333)),
                ),
                child: const Text('REPLACE', style: TextStyle(
                  fontFamily: 'monospace', fontSize: 10,
                  color: Color(0xFFAAAAAA), letterSpacing: 1,
                )),
              ),
            ),
          ),
          Positioned(
            left: 0, right: 0, bottom: 0,
            child: VideoProgressIndicator(
              _videoController!, allowScrubbing: true,
              colors: VideoProgressColors(
                playedColor: const Color(0xFFFF6B00),
                bufferedColor: Colors.white.withOpacity(0.2),
                backgroundColor: Colors.black.withOpacity(0.4),
              ),
            ),
          ),
        ],
      ),
    );
  }

  // ── Quick sliders ─────────────────────────────────────────────────────────────
  Widget _buildQuickSliders() {
    return Column(children: [
      _buildSliderRow(
        icon: Icons.filter_alt_outlined,
        label: 'Noise Cleanup',
        subLabel: 'HPF ${_hpfHz}Hz / LPF ${_lpfHz}Hz',
        value: _noiseCleanup,
        onChanged: _onNoiseChanged,
        leftTick: 'OPEN', rightTick: 'TIGHT',
      ),
      const SizedBox(height: 24),
      _buildSliderRow(
        icon: Icons.waves,
        label: 'Exhaust Deepness',
        subLabel: '200Hz bass +${_eq1GainDb.toStringAsFixed(1)}dB',
        value: _exhaustDepth,
        onChanged: _onDepthChanged,
        leftTick: 'FLAT', rightTick: '+12dB',
      ),
    ]);
  }

  Widget _buildSliderRow({
    required IconData icon, required String label, required String subLabel,
    required double value, required ValueChanged<double> onChanged,
    required String leftTick, required String rightTick,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(children: [
          Icon(icon, color: const Color(0xFFFF6B00), size: 16),
          const SizedBox(width: 8),
          Text(label.toUpperCase(), style: const TextStyle(
            fontFamily: 'monospace', fontWeight: FontWeight.w700,
            fontSize: 12, letterSpacing: 1.4, color: Color(0xFFCCCCCC),
          )),
          const Spacer(),
          Text(subLabel, style: const TextStyle(
            fontFamily: 'monospace', fontSize: 10,
            color: Color(0xFFFF6B00), letterSpacing: 0.5,
          )),
        ]),
        Slider(value: value, onChanged: onChanged),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12),
          child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
            Text(leftTick, style: const TextStyle(fontSize: 9, color: Color(0xFF444444), letterSpacing: 1)),
            Text(rightTick, style: const TextStyle(fontSize: 9, color: Color(0xFF444444), letterSpacing: 1)),
          ]),
        ),
      ],
    );
  }

  // ── Manual tuning section ─────────────────────────────────────────────────────
  Widget _buildManualTuning() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Header toggle
        GestureDetector(
          onTap: () => setState(() => _manualExpanded = !_manualExpanded),
          child: Row(children: [
            Text(
              _manualExpanded ? 'MANUAL TUNING' : 'MANUAL TUNING',
              style: const TextStyle(
                fontFamily: 'monospace', fontSize: 10,
                fontWeight: FontWeight.w700, letterSpacing: 2.5,
                color: Color(0xFFFF6B00),
              ),
            ),
            const SizedBox(width: 8),
            Icon(
              _manualExpanded ? Icons.keyboard_arrow_up : Icons.keyboard_arrow_down,
              color: const Color(0xFFFF6B00), size: 16,
            ),
            const SizedBox(width: 6),
            Expanded(child: Container(height: 1, color: const Color(0xFF2A2A2A))),
          ]),
        ),

        // Collapsible params
        AnimatedCrossFade(
          firstChild: const SizedBox.shrink(),
          secondChild: Padding(
            padding: const EdgeInsets.only(top: 20),
            child: Column(children: [
              _buildParamSlider(
                label: 'HPF FREQUENCY',
                valueStr: '$_hpfHz Hz',
                value: _hpfHz.toDouble(), min: 60, max: 300, divisions: 240,
                onChanged: (v) => setState(() {
                  _hpfHz = v.round();
                  _noiseCleanup = (v - 60) / 120.0;
                }),
              ),
              _buildParamSlider(
                label: 'LPF FREQUENCY',
                valueStr: '$_lpfHz Hz',
                value: _lpfHz.toDouble(), min: 1000, max: 20000, divisions: 190,
                onChanged: (v) => setState(() {
                  _lpfHz = v.round();
                  _noiseCleanup = (9000 - v) / 5000.0;
                }),
              ),
              _buildParamSlider(
                label: 'EQ 200Hz GAIN',
                valueStr: '${_eq1GainDb >= 0 ? '+' : ''}${_eq1GainDb.toStringAsFixed(1)} dB',
                value: _eq1GainDb, min: -12, max: 12, divisions: 240,
                onChanged: (v) => setState(() {
                  _eq1GainDb = (v * 10).round() / 10;
                  _exhaustDepth = (v / 12.0).clamp(0, 1);
                }),
              ),
              _buildParamSlider(
                label: 'EQ 2500Hz GAIN',
                valueStr: '${_eq2GainDb >= 0 ? '+' : ''}${_eq2GainDb.toStringAsFixed(1)} dB',
                value: _eq2GainDb, min: -12, max: 12, divisions: 240,
                onChanged: (v) => setState(() => _eq2GainDb = (v * 10).round() / 10),
              ),
              _buildParamSlider(
                label: 'COMP THRESHOLD',
                valueStr: '${_compThreshDb.toStringAsFixed(0)} dB',
                value: _compThreshDb, min: -40, max: 0, divisions: 40,
                onChanged: (v) => setState(() => _compThreshDb = v.roundToDouble()),
              ),
              _buildParamSlider(
                label: 'COMP RATIO',
                valueStr: '${_compRatio.toStringAsFixed(1)} : 1',
                value: _compRatio, min: 1, max: 20, divisions: 38,
                onChanged: (v) => setState(() => _compRatio = (v * 2).round() / 2),
              ),
              _buildParamSlider(
                label: 'VOLUME BOOST',
                valueStr: '${_volumeDb >= 0 ? '+' : ''}${_volumeDb.toStringAsFixed(1)} dB',
                value: _volumeDb, min: -12, max: 12, divisions: 240,
                onChanged: (v) => setState(() => _volumeDb = (v * 10).round() / 10),
              ),
              _buildParamSlider(
                label: 'LIMITER CEILING',
                valueStr: '${_limiterDb.toStringAsFixed(1)} dBFS',
                value: _limiterDb, min: -12, max: 0, divisions: 120,
                onChanged: (v) => setState(() => _limiterDb = (v * 10).round() / 10),
              ),
            ]),
          ),
          crossFadeState: _manualExpanded ? CrossFadeState.showSecond : CrossFadeState.showFirst,
          duration: const Duration(milliseconds: 260),
          sizeCurve: Curves.easeInOut,
        ),
      ],
    );
  }

  Widget _buildParamSlider({
    required String label,
    required String valueStr,
    required double value,
    required double min,
    required double max,
    required int divisions,
    required ValueChanged<double> onChanged,
  }) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
            Text(label, style: const TextStyle(
              fontFamily: 'monospace', fontSize: 10,
              letterSpacing: 1.2, color: Color(0xFF888888),
            )),
            Text(valueStr, style: const TextStyle(
              fontFamily: 'monospace', fontSize: 11,
              color: Color(0xFFFF6B00), fontWeight: FontWeight.w700,
            )),
          ]),
          const SizedBox(height: 4),
          SliderTheme(
            data: SliderTheme.of(context).copyWith(
              trackHeight: 2,
              thumbShape: const RoundSliderThumbShape(enabledThumbRadius: 7),
            ),
            child: Slider(
              value: value.clamp(min, max),
              min: min, max: max, divisions: divisions,
              onChanged: onChanged,
            ),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12),
            child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
              Text(min % 1 == 0 ? min.toInt().toString() : min.toStringAsFixed(1),
                style: const TextStyle(fontSize: 9, color: Color(0xFF444444))),
              Text(max % 1 == 0 ? max.toInt().toString() : max.toStringAsFixed(1),
                style: const TextStyle(fontSize: 9, color: Color(0xFF444444))),
            ]),
          ),
        ],
      ),
    );
  }

  // ── Pipeline readout ──────────────────────────────────────────────────────────
  Widget _buildPipelineReadout() {
    final stages = [
      ('HPF', '${_hpfHz}Hz cut', 'Removes wind buffet & chassis rumble'),
      ('LPF', '${_lpfHz}Hz cut', 'Strips tyre hiss & valve tick'),
      ('EQ1', '${_eq1GainDb >= 0 ? '+' : ''}${_eq1GainDb.toStringAsFixed(1)}dB@200Hz', 'Mid-bass harmonic body'),
      ('EQ2', '${_eq2GainDb >= 0 ? '+' : ''}${_eq2GainDb.toStringAsFixed(1)}dB@2500Hz', 'Engine bark & firing snap'),
      ('COMP', '${_compThreshDb.toStringAsFixed(0)}dB thr / ${_compRatio.toStringAsFixed(1)}:1', 'Broadcast-density compression'),
      ('VOL',  '${_volumeDb >= 0 ? '+' : ''}${_volumeDb.toStringAsFixed(1)}dB', 'Output level trim'),
      ('LIM',  '${_limiterDb.toStringAsFixed(1)}dBFS ceiling', 'Hard limiter — zero clip'),
    ];

    return Column(
      children: stages.asMap().entries.map((entry) {
        final i = entry.key;
        final s = entry.value;
        final isLast = i == stages.length - 1;
        return Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SizedBox(
              width: 44,
              child: Column(children: [
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 3),
                  decoration: BoxDecoration(
                    color: const Color(0xFF1E1E1E),
                    border: Border.all(color: const Color(0xFF2E2E2E)),
                    borderRadius: BorderRadius.circular(2),
                  ),
                  child: Text(s.$1, style: const TextStyle(
                    fontFamily: 'monospace', fontSize: 9,
                    fontWeight: FontWeight.w700,
                    color: Color(0xFFFF6B00), letterSpacing: 0.5,
                  ), textAlign: TextAlign.center),
                ),
                if (!isLast) Container(width: 1, height: 20, color: const Color(0xFF2A2A2A)),
              ]),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Padding(
                padding: const EdgeInsets.only(top: 2, bottom: 18),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(s.$2, style: const TextStyle(
                    fontFamily: 'monospace', fontSize: 11,
                    color: Color(0xFFE0E0E0), letterSpacing: 0.3,
                  )),
                  const SizedBox(height: 2),
                  Text(s.$3, style: const TextStyle(
                    fontSize: 11, color: Color(0xFF555555), height: 1.3,
                  )),
                ]),
              ),
            ),
          ],
        );
      }).toList(),
    );
  }

  // ── Enhance button ────────────────────────────────────────────────────────────
  Widget _buildEnhanceButton() {
    final canProcess = _videoFile != null && !_isLoading;
    return AnimatedOpacity(
      opacity: canProcess ? 1.0 : 0.35,
      duration: const Duration(milliseconds: 200),
      child: ElevatedButton.icon(
        onPressed: canProcess ? _processVideo : null,
        icon: const Icon(Icons.bolt, size: 20),
        label: const Text('ENHANCE & SAVE TO GALLERY'),
      ),
    );
  }

  // ── Loading overlay ───────────────────────────────────────────────────────────
  Widget _buildLoadingOverlay() {
    return Positioned.fill(
      child: DecoratedBox(
        decoration: BoxDecoration(color: Colors.black.withOpacity(0.82)),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            AnimatedBuilder(
              animation: _pulseAnimation,
              builder: (_, __) => Opacity(
                opacity: _pulseAnimation.value,
                child: const Icon(Icons.graphic_eq, color: Color(0xFFFF6B00), size: 48),
              ),
            ),
            const SizedBox(height: 28),
            const SizedBox(
              width: 44, height: 44,
              child: CircularProgressIndicator(
                strokeWidth: 2.5, color: Color(0xFFFF6B00),
                backgroundColor: Color(0xFF2A2A2A),
              ),
            ),
            const SizedBox(height: 24),
            Text(_loadingMessage, style: const TextStyle(
              fontFamily: 'monospace', fontSize: 13,
              color: Color(0xFFCCCCCC), letterSpacing: 1.2,
            )),
            const SizedBox(height: 8),
            const Text('please wait', style: TextStyle(
              fontSize: 11, color: Color(0xFF444444), letterSpacing: 0.5,
            )),
          ],
        ),
      ),
    );
  }

  // ── Section divider label ─────────────────────────────────────────────────────
  Widget _buildDividerLabel(String label) {
    return Row(children: [
      Text(label, style: const TextStyle(
        fontFamily: 'monospace', fontSize: 10,
        fontWeight: FontWeight.w700, letterSpacing: 2.5, color: Color(0xFF444444),
      )),
      const SizedBox(width: 10),
      Expanded(child: Container(height: 1, color: const Color(0xFF222222))),
    ]);
  }
}
