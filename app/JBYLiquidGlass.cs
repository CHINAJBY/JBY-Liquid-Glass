using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Net.Sockets;
using System.Security.Principal;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Media.Effects;
using System.Windows.Media.Imaging;
using System.Windows.Threading;
using Win32OpenFileDialog = Microsoft.Win32.OpenFileDialog;

namespace JBYLiquidGlassApp
{
    internal sealed class ThemeCardInfo
    {
        public string Id { get; set; }
        public string DirName { get; set; }
        public string DirectoryPath { get; set; }
        public string Name { get; set; }
        public string Subtitle { get; set; }
        public string Appearance { get; set; }
        public bool LiquidGlass { get; set; }
        public string ThumbPath { get; set; }
        public int DefaultTransparency { get; set; }
    }

    internal static class JsonHelper
    {
        private static JavaScriptSerializer CreateSerializer()
        {
            JavaScriptSerializer s = new JavaScriptSerializer();
            s.MaxJsonLength = 8 * 1024 * 1024;
            return s;
        }

        public static Dictionary<string, object> ReadDict(string path)
        {
            try
            {
                if (!File.Exists(path)) return null;
                string raw = File.ReadAllText(path, Encoding.UTF8);
                return CreateSerializer().Deserialize<Dictionary<string, object>>(raw);
            }
            catch
            {
                return null;
            }
        }

        public static void WriteDictAtomic(string path, Dictionary<string, object> data)
        {
            string dir = Path.GetDirectoryName(path);
            if (!string.IsNullOrEmpty(dir)) Directory.CreateDirectory(dir);
            string tmp = path + ".tmp-" + Process.GetCurrentProcess().Id + "-" + DateTime.UtcNow.Ticks;
            string json = CreateSerializer().Serialize(data) + "\r\n";
            File.WriteAllText(tmp, json, new UTF8Encoding(false));
            if (File.Exists(path)) File.Delete(path);
            File.Move(tmp, path);
        }

        public static Dictionary<string, object> EnsureChildDict(Dictionary<string, object> parent, string key)
        {
            object v;
            if (parent.TryGetValue(key, out v) && v is Dictionary<string, object>)
            {
                return (Dictionary<string, object>)v;
            }
            Dictionary<string, object> child = new Dictionary<string, object>(StringComparer.Ordinal);
            parent[key] = child;
            return child;
        }

        public static string GetString(Dictionary<string, object> dict, string key, string fallback)
        {
            if (dict == null) return fallback;
            object v;
            if (!dict.TryGetValue(key, out v) || v == null) return fallback;
            string s = Convert.ToString(v);
            return string.IsNullOrEmpty(s) ? fallback : s;
        }

        public static bool GetBool(Dictionary<string, object> dict, string key, bool fallback)
        {
            if (dict == null) return fallback;
            object v;
            if (!dict.TryGetValue(key, out v) || v == null) return fallback;
            if (v is bool) return (bool)v;
            bool b;
            return bool.TryParse(Convert.ToString(v), out b) ? b : fallback;
        }

        public static int GetInt(Dictionary<string, object> dict, string key, int fallback)
        {
            if (dict == null) return fallback;
            object v;
            if (!dict.TryGetValue(key, out v) || v == null) return fallback;
            try { return Convert.ToInt32(v); } catch { return fallback; }
        }
    }

    internal sealed class MainWindow : Window
    {
        private readonly string stateRoot;
        private readonly string engineRoot;
        private readonly string agyRoot;
        private readonly string startupShortcutPath;
        private readonly bool smokeTest;

        private string selectedTarget = "codex"; // "codex" | "antigravity"
        private bool suppressUiEvents = false;
        private bool draggingSlider = false;
        private List<ThemeCardInfo> themes = new List<ThemeCardInfo>();
        private string activeCodexId = "";
        private string activeAgyId = "";
        private string lastCatalogKey = "";
        private string lastPresetsKey = "";

        private Button tabCodexBtn;
        private Button tabAgyBtn;
        private Border statusBadge;
        private TextBlock statusDotText;
        private TextBlock statusLabelText;
        private TextBlock currentThemeText;
        private Slider transparencySlider;
        private TextBlock transparencyValueText;
        private Button applyBtn;
        private Button pauseBtn;
        private Button restoreBtn;
        private Button pushBothBtn;
        private CheckBox autoGuardChk;
        private Button shortcutOptBtn;
        private ComboBox presetCombo;
        private Button presetApplyBtn;
        private Button presetDefaultBtn;
        private Button presetSaveBtn;
        private WrapPanel themeGridPanel;
        private CheckBox autoLgImportChk;
        private ComboBox importPushCombo;
        private CheckBox startupChk;
        private TextBlock footerHintText;

        private DispatcherTimer refreshTimer;
        private DispatcherTimer saveSliderTimer;
        private DispatcherTimer smokeTimer;

        private static Color Rgb(byte r, byte g, byte b) { return Color.FromRgb(r, g, b); }
        private static Color Argb(byte a, byte r, byte g, byte b) { return Color.FromArgb(a, r, g, b); }
        private static SolidColorBrush BrushOf(Color c)
        {
            SolidColorBrush b = new SolidColorBrush(c);
            b.Freeze();
            return b;
        }

        public MainWindow(string resolvedStateRoot, string resolvedEngineRoot, bool isSmokeTest)
        {
            stateRoot = resolvedStateRoot;
            engineRoot = resolvedEngineRoot;
            agyRoot = Path.Combine(stateRoot, "antigravity");
            startupShortcutPath = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.Startup),
                "JBY Liquid Glass.lnk");
            smokeTest = isSmokeTest;

            Title = "JBY Liquid Glass";
            Width = 1040;
            Height = 760;
            MinWidth = 880;
            MinHeight = 620;
            WindowStartupLocation = WindowStartupLocation.CenterScreen;
            FontFamily = new FontFamily("Microsoft YaHei UI, Segoe UI");
            Background = new LinearGradientBrush(Rgb(242, 246, 253), Rgb(232, 240, 252), 135.0);
            Foreground = BrushOf(Rgb(16, 24, 42));

            TryLoadWindowIcon();
            BuildVisualTree();

            saveSliderTimer = new DispatcherTimer();
            saveSliderTimer.Interval = TimeSpan.FromMilliseconds(260);
            saveSliderTimer.Tick += delegate
            {
                saveSliderTimer.Stop();
                CommitTransparencyValue((int)Math.Round(transparencySlider.Value));
            };

            refreshTimer = new DispatcherTimer();
            refreshTimer.Interval = TimeSpan.FromMilliseconds(2000);
            refreshTimer.Tick += delegate
            {
                if (!draggingSlider) RefreshStateAndGrid(false);
            };

            Loaded += delegate
            {
                RefreshStateAndGrid(true);
                refreshTimer.Start();
                if (smokeTest)
                {
                    smokeTimer = new DispatcherTimer();
                    smokeTimer.Interval = TimeSpan.FromMilliseconds(2200);
                    smokeTimer.Tick += delegate { smokeTimer.Stop(); Close(); };
                    smokeTimer.Start();
                }
            };

            Closing += delegate
            {
                if (saveSliderTimer != null && saveSliderTimer.IsEnabled)
                {
                    saveSliderTimer.Stop();
                    CommitTransparencyValue((int)Math.Round(transparencySlider.Value));
                }
                if (refreshTimer != null) refreshTimer.Stop();
                if (smokeTimer != null) smokeTimer.Stop();
            };
        }

        private void TryLoadWindowIcon()
        {
            try
            {
                string[] candidates = new string[]
                {
                    Path.Combine(Program.ResolveInstallBaseDir(), "payload", "assets", "jby-liquid-glass.ico"),
                    Path.Combine(engineRoot, "assets", "jby-liquid-glass.ico"),
                    Path.Combine(Program.ResolveInstallBaseDir(), "assets", "jby-liquid-glass.ico")
                };
                for (int i = 0; i < candidates.Length; i++)
                {
                    if (File.Exists(candidates[i]))
                    {
                        using (FileStream fs = File.OpenRead(candidates[i]))
                        {
                            IconBitmapDecoder dec = new IconBitmapDecoder(fs, BitmapCreateOptions.PreservePixelFormat, BitmapCacheOption.OnLoad);
                            if (dec.Frames.Count > 0)
                            {
                                Icon = dec.Frames[dec.Frames.Count - 1];
                                return;
                            }
                        }
                    }
                }
            }
            catch { }
        }

        private ImageSource LoadLogoImage()
        {
            try
            {
                string[] candidates = new string[]
                {
                    Path.Combine(Program.ResolveInstallBaseDir(), "payload", "assets", "jby-liquid-glass-icon.png"),
                    Path.Combine(engineRoot, "assets", "jby-liquid-glass-icon.png"),
                    Path.Combine(Program.ResolveInstallBaseDir(), "assets", "jby-liquid-glass-icon.png")
                };
                for (int i = 0; i < candidates.Length; i++)
                {
                    if (File.Exists(candidates[i]))
                    {
                        BitmapImage bi = new BitmapImage();
                        bi.BeginInit();
                        bi.CacheOption = BitmapCacheOption.OnLoad;
                        bi.DecodePixelWidth = 88;
                        bi.UriSource = new Uri(candidates[i], UriKind.Absolute);
                        bi.EndInit();
                        bi.Freeze();
                        return bi;
                    }
                }
            }
            catch { }
            return null;
        }

        private Border MakeCard(Thickness pad, double radius)
        {
            Border b = new Border();
            b.Background = BrushOf(Argb(232, 255, 255, 255));
            b.BorderBrush = BrushOf(Argb(215, 214, 225, 240));
            b.BorderThickness = new Thickness(1);
            b.CornerRadius = new CornerRadius(radius);
            b.Padding = pad;
            DropShadowEffect fx = new DropShadowEffect();
            fx.Color = Rgb(16, 28, 56);
            fx.Opacity = 0.065;
            fx.BlurRadius = 18;
            fx.ShadowDepth = 4;
            fx.Direction = 270;
            b.Effect = fx;
            return b;
        }

        private Button MakeActionButton(string text, bool primary)
        {
            Button btn = new Button();
            btn.Content = text;
            btn.FontSize = 12.5;
            btn.FontWeight = primary ? FontWeights.SemiBold : FontWeights.Medium;
            btn.Padding = new Thickness(14, 7, 14, 7);
            btn.Margin = new Thickness(0, 0, 8, 0);
            btn.Cursor = Cursors.Hand;
            btn.Background = primary ? BrushOf(Rgb(47, 117, 195)) : BrushOf(Rgb(244, 247, 253));
            btn.Foreground = primary ? Brushes.White : BrushOf(Rgb(24, 34, 54));
            btn.BorderBrush = primary ? BrushOf(Rgb(36, 98, 170)) : BrushOf(Rgb(208, 220, 238));
            btn.BorderThickness = new Thickness(1);

            Style st = new Style(typeof(Button));
            ControlTemplate ct = new ControlTemplate(typeof(Button));
            FrameworkElementFactory bd = new FrameworkElementFactory(typeof(Border));
            bd.SetValue(Border.BackgroundProperty, new TemplateBindingExtension(Control.BackgroundProperty));
            bd.SetValue(Border.BorderBrushProperty, new TemplateBindingExtension(Control.BorderBrushProperty));
            bd.SetValue(Border.BorderThicknessProperty, new TemplateBindingExtension(Control.BorderThicknessProperty));
            bd.SetValue(Border.CornerRadiusProperty, new CornerRadius(10));
            bd.SetValue(Border.PaddingProperty, new TemplateBindingExtension(Control.PaddingProperty));
            FrameworkElementFactory cp = new FrameworkElementFactory(typeof(ContentPresenter));
            cp.SetValue(ContentPresenter.HorizontalAlignmentProperty, HorizontalAlignment.Center);
            cp.SetValue(ContentPresenter.VerticalAlignmentProperty, VerticalAlignment.Center);
            bd.AppendChild(cp);
            ct.VisualTree = bd;
            st.Setters.Add(new Setter(Control.TemplateProperty, ct));
            btn.Style = st;
            return btn;
        }

        private void BuildVisualTree()
        {
            Grid root = new Grid();
            root.Margin = new Thickness(20, 16, 20, 16);
            RowDefinition rHead = new RowDefinition(); rHead.Height = GridLength.Auto;
            RowDefinition rCtrl = new RowDefinition(); rCtrl.Height = GridLength.Auto;
            RowDefinition rGrid = new RowDefinition(); rGrid.Height = new GridLength(1, GridUnitType.Star);
            RowDefinition rFoot = new RowDefinition(); rFoot.Height = GridLength.Auto;
            root.RowDefinitions.Add(rHead);
            root.RowDefinitions.Add(rCtrl);
            root.RowDefinitions.Add(rGrid);
            root.RowDefinitions.Add(rFoot);

            // Row 0: Header + Segmented Target Switcher
            Grid header = new Grid();
            header.Margin = new Thickness(0, 0, 0, 14);
            ColumnDefinition hc0 = new ColumnDefinition(); hc0.Width = new GridLength(1, GridUnitType.Star);
            ColumnDefinition hc1 = new ColumnDefinition(); hc1.Width = GridLength.Auto;
            header.ColumnDefinitions.Add(hc0);
            header.ColumnDefinitions.Add(hc1);

            StackPanel brandRow = new StackPanel();
            brandRow.Orientation = Orientation.Horizontal;
            brandRow.VerticalAlignment = VerticalAlignment.Center;
            Image logo = new Image();
            logo.Width = 42;
            logo.Height = 42;
            logo.Margin = new Thickness(0, 0, 12, 0);
            RenderOptions.SetBitmapScalingMode(logo, BitmapScalingMode.HighQuality);
            ImageSource logoSrc = LoadLogoImage();
            if (logoSrc != null) logo.Source = logoSrc;
            brandRow.Children.Add(logo);

            StackPanel titleCol = new StackPanel();
            titleCol.VerticalAlignment = VerticalAlignment.Center;
            TextBlock tMain = new TextBlock();
            tMain.Text = "JBY Liquid Glass";
            tMain.FontSize = 20;
            tMain.FontWeight = FontWeights.Bold;
            tMain.Foreground = BrushOf(Rgb(14, 22, 40));
            TextBlock tSub = new TextBlock();
            tSub.Text = "双端液态玻璃桌面中心 · Codex (9335) 与 Antigravity (9235) 独立换肤";
            tSub.FontSize = 12;
            tSub.Foreground = BrushOf(Rgb(86, 102, 128));
            titleCol.Children.Add(tMain);
            titleCol.Children.Add(tSub);
            brandRow.Children.Add(titleCol);
            header.Children.Add(brandRow);
            Grid.SetColumn(brandRow, 0);

            Border segPill = new Border();
            segPill.Background = BrushOf(Argb(215, 226, 235, 248));
            segPill.BorderBrush = BrushOf(Rgb(200, 214, 234));
            segPill.BorderThickness = new Thickness(1);
            segPill.CornerRadius = new CornerRadius(14);
            segPill.Padding = new Thickness(4);
            segPill.VerticalAlignment = VerticalAlignment.Center;
            StackPanel segStack = new StackPanel();
            segStack.Orientation = Orientation.Horizontal;

            tabCodexBtn = MakeActionButton("Codex · 端口 9335", true);
            tabCodexBtn.Margin = new Thickness(0, 0, 4, 0);
            tabCodexBtn.Click += delegate { SelectTarget("codex"); };
            tabAgyBtn = MakeActionButton("Antigravity · 端口 9235", false);
            tabAgyBtn.Margin = new Thickness(0);
            tabAgyBtn.Click += delegate { SelectTarget("antigravity"); };
            segStack.Children.Add(tabCodexBtn);
            segStack.Children.Add(tabAgyBtn);
            segPill.Child = segStack;
            header.Children.Add(segPill);
            Grid.SetColumn(segPill, 1);

            root.Children.Add(header);
            Grid.SetRow(header, 0);

            // Row 1: Active Status, Transparency Slider & Quick Actions Card
            Border ctrlCard = MakeCard(new Thickness(16, 14, 16, 14), 16);
            ctrlCard.Margin = new Thickness(0, 0, 0, 14);
            StackPanel ctrlStack = new StackPanel();

            Grid topInfo = new Grid();
            ColumnDefinition ic0 = new ColumnDefinition(); ic0.Width = GridLength.Auto;
            ColumnDefinition ic1 = new ColumnDefinition(); ic1.Width = new GridLength(1, GridUnitType.Star);
            ColumnDefinition ic2 = new ColumnDefinition(); ic2.Width = GridLength.Auto;
            topInfo.ColumnDefinitions.Add(ic0);
            topInfo.ColumnDefinitions.Add(ic1);
            topInfo.ColumnDefinitions.Add(ic2);

            statusBadge = new Border();
            statusBadge.CornerRadius = new CornerRadius(99);
            statusBadge.Padding = new Thickness(10, 4, 10, 4);
            statusBadge.Background = BrushOf(Rgb(234, 243, 255));
            statusBadge.BorderBrush = BrushOf(Rgb(186, 212, 246));
            statusBadge.BorderThickness = new Thickness(1);
            statusBadge.VerticalAlignment = VerticalAlignment.Center;
            StackPanel stPanel = new StackPanel();
            stPanel.Orientation = Orientation.Horizontal;
            statusDotText = new TextBlock();
            statusDotText.Text = "● ";
            statusDotText.FontSize = 11;
            statusDotText.Foreground = BrushOf(Rgb(40, 167, 104));
            statusLabelText = new TextBlock();
            statusLabelText.Text = "检测中...";
            statusLabelText.FontSize = 12;
            statusLabelText.FontWeight = FontWeights.SemiBold;
            stPanel.Children.Add(statusDotText);
            stPanel.Children.Add(statusLabelText);
            statusBadge.Child = stPanel;
            topInfo.Children.Add(statusBadge);
            Grid.SetColumn(statusBadge, 0);

            currentThemeText = new TextBlock();
            currentThemeText.Margin = new Thickness(12, 0, 12, 0);
            currentThemeText.VerticalAlignment = VerticalAlignment.Center;
            currentThemeText.FontSize = 13.5;
            currentThemeText.FontWeight = FontWeights.SemiBold;
            currentThemeText.Foreground = BrushOf(Rgb(20, 30, 50));
            topInfo.Children.Add(currentThemeText);
            Grid.SetColumn(currentThemeText, 1);

            StackPanel sliderBox = new StackPanel();
            sliderBox.Orientation = Orientation.Horizontal;
            sliderBox.VerticalAlignment = VerticalAlignment.Center;
            TextBlock sLbl = new TextBlock();
            sLbl.Text = "玻璃通透度：";
            sLbl.FontSize = 12.5;
            sLbl.VerticalAlignment = VerticalAlignment.Center;
            sLbl.Foreground = BrushOf(Rgb(66, 80, 104));
            transparencySlider = new Slider();
            transparencySlider.Width = 170;
            transparencySlider.Minimum = 15;
            transparencySlider.Maximum = 100;
            transparencySlider.TickFrequency = 5;
            transparencySlider.VerticalAlignment = VerticalAlignment.Center;
            transparencySlider.PreviewMouseLeftButtonDown += delegate { draggingSlider = true; };
            transparencySlider.PreviewMouseLeftButtonUp += delegate
            {
                draggingSlider = false;
                if (saveSliderTimer != null) saveSliderTimer.Stop();
                CommitTransparencyValue((int)Math.Round(transparencySlider.Value));
            };
            transparencySlider.ValueChanged += delegate
            {
                int val = (int)Math.Round(transparencySlider.Value);
                if (transparencyValueText != null) transparencyValueText.Text = val + "%";
                if (suppressUiEvents) return;
                if (saveSliderTimer != null)
                {
                    saveSliderTimer.Stop();
                    saveSliderTimer.Start();
                }
            };
            transparencyValueText = new TextBlock();
            transparencyValueText.Width = 44;
            transparencyValueText.TextAlignment = TextAlignment.Right;
            transparencyValueText.FontSize = 12.5;
            transparencyValueText.FontWeight = FontWeights.Bold;
            transparencyValueText.Foreground = BrushOf(Rgb(47, 117, 195));
            transparencyValueText.VerticalAlignment = VerticalAlignment.Center;
            sliderBox.Children.Add(sLbl);
            sliderBox.Children.Add(transparencySlider);
            sliderBox.Children.Add(transparencyValueText);
            topInfo.Children.Add(sliderBox);
            Grid.SetColumn(sliderBox, 2);

            ctrlStack.Children.Add(topInfo);

            WrapPanel quickRow = new WrapPanel();
            quickRow.Margin = new Thickness(0, 12, 0, 0);
            quickRow.VerticalAlignment = VerticalAlignment.Center;

            applyBtn = MakeActionButton("立即应用 / 重载", true);
            applyBtn.Click += delegate { RunApplyCurrentApp(""); };
            pauseBtn = MakeActionButton("暂停皮肤", false);
            pauseBtn.Click += delegate { TogglePauseCurrentApp(); };
            restoreBtn = MakeActionButton("还原原生外观", false);
            restoreBtn.Click += delegate { RunRestoreCurrentApp(); };
            pushBothBtn = MakeActionButton("推送当前皮肤至双端", false);
            pushBothBtn.Click += delegate { PushCurrentThemeToBoth(); };

            autoGuardChk = new CheckBox();
            autoGuardChk.Content = "开机与重开自动挂载";
            autoGuardChk.FontSize = 12.5;
            autoGuardChk.VerticalAlignment = VerticalAlignment.Center;
            autoGuardChk.Margin = new Thickness(8, 0, 12, 0);
            autoGuardChk.Click += delegate
            {
                if (!suppressUiEvents) ToggleAutoGuard(autoGuardChk.IsChecked == true);
            };

            shortcutOptBtn = MakeActionButton("优化桌面应用快捷方式（点击即用）", false);
            shortcutOptBtn.Click += delegate { OptimizeAllAppShortcuts(); };

            quickRow.Children.Add(applyBtn);
            quickRow.Children.Add(pauseBtn);
            quickRow.Children.Add(restoreBtn);
            quickRow.Children.Add(pushBothBtn);
            quickRow.Children.Add(autoGuardChk);
            quickRow.Children.Add(shortcutOptBtn);

            ctrlStack.Children.Add(quickRow);

            WrapPanel presetRow = new WrapPanel();
            presetRow.Margin = new Thickness(0, 10, 0, 0);
            presetRow.VerticalAlignment = VerticalAlignment.Center;

            TextBlock pLbl = new TextBlock();
            pLbl.Text = "共享光学预设：";
            pLbl.FontSize = 12.5;
            pLbl.VerticalAlignment = VerticalAlignment.Center;
            pLbl.Foreground = BrushOf(Rgb(66, 80, 104));
            pLbl.Margin = new Thickness(0, 0, 6, 0);

            presetCombo = new ComboBox();
            presetCombo.Width = 240;
            presetCombo.Height = 28;
            presetCombo.VerticalContentAlignment = VerticalAlignment.Center;
            presetCombo.Margin = new Thickness(0, 0, 8, 0);

            presetApplyBtn = MakeActionButton("应用到当前端", false);
            presetApplyBtn.Height = 28;
            presetApplyBtn.Click += delegate { ApplySelectedPresetToCurrentApp(); };

            presetDefaultBtn = MakeActionButton("设为默认", false);
            presetDefaultBtn.Height = 28;
            presetDefaultBtn.Click += delegate { SetSelectedPresetAsDefault(); };

            presetSaveBtn = MakeActionButton("将当前调校存为预设", false);
            presetSaveBtn.Height = 28;
            presetSaveBtn.Click += delegate { SaveCurrentAsNewPreset(); };

            presetRow.Children.Add(pLbl);
            presetRow.Children.Add(presetCombo);
            presetRow.Children.Add(presetApplyBtn);
            presetRow.Children.Add(presetDefaultBtn);
            presetRow.Children.Add(presetSaveBtn);
            ctrlStack.Children.Add(presetRow);
            ctrlCard.Child = ctrlStack;
            root.Children.Add(ctrlCard);
            Grid.SetRow(ctrlCard, 1);

            // Row 2: Visual Shared Theme Grid
            Border gridCard = MakeCard(new Thickness(14), 16);
            Grid gridInner = new Grid();
            RowDefinition gr0 = new RowDefinition(); gr0.Height = GridLength.Auto;
            RowDefinition gr1 = new RowDefinition(); gr1.Height = new GridLength(1, GridUnitType.Star);
            gridInner.RowDefinitions.Add(gr0);
            gridInner.RowDefinitions.Add(gr1);

            TextBlock gridHdr = new TextBlock();
            gridHdr.Text = "共享液态玻璃与主题库（点击卡片仅切换当前所选应用的皮肤，Codex 与 Antigravity 互不影响）";
            gridHdr.FontSize = 12.5;
            gridHdr.FontWeight = FontWeights.SemiBold;
            gridHdr.Foreground = BrushOf(Rgb(70, 84, 110));
            gridHdr.Margin = new Thickness(4, 0, 4, 10);
            gridInner.Children.Add(gridHdr);
            Grid.SetRow(gridHdr, 0);

            ScrollViewer sv = new ScrollViewer();
            sv.VerticalScrollBarVisibility = ScrollBarVisibility.Auto;
            themeGridPanel = new WrapPanel();
            themeGridPanel.Orientation = Orientation.Horizontal;
            sv.Content = themeGridPanel;
            gridInner.Children.Add(sv);
            Grid.SetRow(sv, 1);

            gridCard.Child = gridInner;
            root.Children.Add(gridCard);
            Grid.SetRow(gridCard, 2);

            // Row 3: Bottom Library & System Bar
            Border footCard = MakeCard(new Thickness(14, 10, 14, 10), 14);
            footCard.Margin = new Thickness(0, 12, 0, 0);
            Grid footGrid = new Grid();
            ColumnDefinition fc0 = new ColumnDefinition(); fc0.Width = new GridLength(1, GridUnitType.Star);
            ColumnDefinition fc1 = new ColumnDefinition(); fc1.Width = GridLength.Auto;
            footGrid.ColumnDefinitions.Add(fc0);
            footGrid.ColumnDefinitions.Add(fc1);

            StackPanel leftTools = new StackPanel();
            leftTools.Orientation = Orientation.Horizontal;
            leftTools.VerticalAlignment = VerticalAlignment.Center;
            Button importBtn = MakeActionButton("导入主题 ZIP…", false);
            importBtn.Click += delegate { ImportThemeZip(); };

            autoLgImportChk = new CheckBox();
            autoLgImportChk.Content = "自动转液态玻璃";
            autoLgImportChk.IsChecked = true;
            autoLgImportChk.FontSize = 12;
            autoLgImportChk.VerticalAlignment = VerticalAlignment.Center;
            autoLgImportChk.Margin = new Thickness(0, 0, 8, 0);

            importPushCombo = new ComboBox();
            importPushCombo.Width = 112;
            importPushCombo.Height = 28;
            importPushCombo.FontSize = 11.5;
            importPushCombo.VerticalContentAlignment = VerticalAlignment.Center;
            importPushCombo.Margin = new Thickness(0, 0, 8, 0);
            importPushCombo.Items.Add("同时推送双端");
            importPushCombo.Items.Add("仅推送当前端");
            importPushCombo.Items.Add("仅导入共享库");
            importPushCombo.SelectedIndex = 0;

            Button pickMediaBtn = MakeActionButton("自定义壁纸 / 视频…", false);
            pickMediaBtn.Click += delegate { PickCustomMedia(); };
            Button openLibBtn = MakeActionButton("打开共享主题库", false);
            openLibBtn.Click += delegate
            {
                string dir = Path.Combine(stateRoot, "themes");
                Directory.CreateDirectory(dir);
                Process.Start("explorer.exe", dir);
            };
            leftTools.Children.Add(importBtn);
            leftTools.Children.Add(autoLgImportChk);
            leftTools.Children.Add(importPushCombo);
            leftTools.Children.Add(pickMediaBtn);
            leftTools.Children.Add(openLibBtn);

            footerHintText = new TextBlock();
            footerHintText.VerticalAlignment = VerticalAlignment.Center;
            footerHintText.Margin = new Thickness(8, 0, 0, 0);
            footerHintText.FontSize = 11.5;
            footerHintText.Foreground = BrushOf(Rgb(90, 106, 132));
            leftTools.Children.Add(footerHintText);

            footGrid.Children.Add(leftTools);
            Grid.SetColumn(leftTools, 0);

            StackPanel rightSys = new StackPanel();
            rightSys.Orientation = Orientation.Horizontal;
            rightSys.VerticalAlignment = VerticalAlignment.Center;
            startupChk = new CheckBox();
            startupChk.Content = "开机自启托盘";
            startupChk.FontSize = 12.5;
            startupChk.VerticalAlignment = VerticalAlignment.Center;
            startupChk.Margin = new Thickness(0, 0, 12, 0);
            startupChk.Click += delegate
            {
                if (!suppressUiEvents) SetStartupShortcut(startupChk.IsChecked == true);
            };
            Button hideBtn = MakeActionButton("最小化到托盘", false);
            hideBtn.Margin = new Thickness(0);
            hideBtn.Click += delegate { Close(); };
            rightSys.Children.Add(startupChk);
            rightSys.Children.Add(hideBtn);
            footGrid.Children.Add(rightSys);
            Grid.SetColumn(rightSys, 1);

            footCard.Child = footGrid;
            root.Children.Add(footCard);
            Grid.SetRow(footCard, 3);

            Content = root;
        }

        private void SelectTarget(string target)
        {
            selectedTarget = target;
            UpdateTargetTabsVisual();
            RefreshStateAndGrid(true);
        }

        private void UpdateTargetTabsVisual()
        {
            bool isCodex = selectedTarget == "codex";
            tabCodexBtn.Background = isCodex ? BrushOf(Rgb(47, 117, 195)) : Brushes.Transparent;
            tabCodexBtn.Foreground = isCodex ? Brushes.White : BrushOf(Rgb(36, 52, 78));
            tabCodexBtn.BorderBrush = isCodex ? BrushOf(Rgb(36, 98, 170)) : Brushes.Transparent;

            tabAgyBtn.Background = !isCodex ? BrushOf(Rgb(47, 117, 195)) : Brushes.Transparent;
            tabAgyBtn.Foreground = !isCodex ? Brushes.White : BrushOf(Rgb(36, 52, 78));
            tabAgyBtn.BorderBrush = !isCodex ? BrushOf(Rgb(36, 98, 170)) : Brushes.Transparent;
        }

        private bool TestLoopbackPort(int port)
        {
            try
            {
                using (TcpClient client = new TcpClient())
                {
                    IAsyncResult ar = client.BeginConnect("127.0.0.1", port, null, null);
                    bool ok = ar.AsyncWaitHandle.WaitOne(120);
                    if (!ok) return false;
                    client.EndConnect(ar);
                    return true;
                }
            }
            catch
            {
                return false;
            }
        }

        private bool IsStateInjectorRunning(string stateFile)
        {
            Dictionary<string, object> st = JsonHelper.ReadDict(stateFile);
            int pid = JsonHelper.GetInt(st, "injectorPid", 0);
            if (pid <= 0) return false;
            try
            {
                Process p = Process.GetProcessById(pid);
                bool alive = !p.HasExited;
                p.Dispose();
                return alive;
            }
            catch
            {
                return false;
            }
        }

        private int ResolveDefaultPresetTransparency(int fallback)
        {
            Dictionary<string, object> op = JsonHelper.ReadDict(Path.Combine(stateRoot, "optical-presets.json"));
            if (op == null) return fallback;
            string defId = JsonHelper.GetString(op, "defaultPresetId", "");
            if (string.IsNullOrEmpty(defId)) return fallback;
            object rawList;
            if (!op.TryGetValue("presets", out rawList)) return fallback;
            System.Collections.ArrayList list = rawList as System.Collections.ArrayList;
            if (list == null) return fallback;
            for (int i = 0; i < list.Count; i++)
            {
                Dictionary<string, object> p = list[i] as Dictionary<string, object>;
                if (p != null && JsonHelper.GetString(p, "id", "") == defId)
                {
                    Dictionary<string, object> ps = p.ContainsKey("params") ? p["params"] as Dictionary<string, object> : null;
                    if (ps != null) return Math.Max(15, Math.Min(100, JsonHelper.GetInt(ps, "transparency", fallback)));
                }
            }
            return fallback;
        }

        private int ResolveTransparencyFor(string themeId, int fallback)
        {
            int defAlpha = ResolveDefaultPresetTransparency(fallback);
            if (selectedTarget == "antigravity")
            {
                Dictionary<string, object> cfg = JsonHelper.ReadDict(Path.Combine(agyRoot, "plugin-config.json"));
                Dictionary<string, object> th = cfg != null && cfg.ContainsKey("themes") ? cfg["themes"] as Dictionary<string, object> : null;
                Dictionary<string, object> entry = th != null && !string.IsNullOrEmpty(themeId) && th.ContainsKey(themeId) ? th[themeId] as Dictionary<string, object> : null;
                if (entry != null) return Math.Max(15, Math.Min(100, JsonHelper.GetInt(entry, "transparency", defAlpha)));

                Dictionary<string, object> prefs = JsonHelper.ReadDict(Path.Combine(agyRoot, "theme-preferences.json"));
                th = prefs != null && prefs.ContainsKey("themes") ? prefs["themes"] as Dictionary<string, object> : null;
                entry = th != null && !string.IsNullOrEmpty(themeId) && th.ContainsKey(themeId) ? th[themeId] as Dictionary<string, object> : null;
                if (entry != null) return Math.Max(15, Math.Min(100, JsonHelper.GetInt(entry, "transparency", defAlpha)));
                return defAlpha;
            }
            else
            {
                Dictionary<string, object> prefs = JsonHelper.ReadDict(Path.Combine(stateRoot, "theme-preferences.json"));
                Dictionary<string, object> th = prefs != null && prefs.ContainsKey("themes") ? prefs["themes"] as Dictionary<string, object> : null;
                Dictionary<string, object> entry = th != null && !string.IsNullOrEmpty(themeId) && th.ContainsKey(themeId) ? th[themeId] as Dictionary<string, object> : null;
                if (entry != null) return Math.Max(15, Math.Min(100, JsonHelper.GetInt(entry, "transparency", defAlpha)));

                Dictionary<string, object> cfg = JsonHelper.ReadDict(Path.Combine(stateRoot, "dream-skin-plugin.json"));
                th = cfg != null && cfg.ContainsKey("themes") ? cfg["themes"] as Dictionary<string, object> : null;
                entry = th != null && !string.IsNullOrEmpty(themeId) && th.ContainsKey(themeId) ? th[themeId] as Dictionary<string, object> : null;
                if (entry != null) return Math.Max(15, Math.Min(100, JsonHelper.GetInt(entry, "transparency", defAlpha)));
                return defAlpha;
            }
        }

        private List<ThemeCardInfo> ScanThemes()
        {
            List<ThemeCardInfo> list = new List<ThemeCardInfo>();
            string themesDir = Path.Combine(stateRoot, "themes");
            string thumbCacheDir = Path.Combine(stateRoot, "thumb-cache");
            if (!Directory.Exists(themesDir)) return list;

            string[] dirs = Directory.GetDirectories(themesDir);
            for (int i = 0; i < dirs.Length; i++)
            {
                string d = dirs[i];
                string dirName = Path.GetFileName(d);
                if (dirName.StartsWith(".")) continue;
                Dictionary<string, object> meta = JsonHelper.ReadDict(Path.Combine(d, "theme.json"));
                if (meta == null) continue;

                string id = JsonHelper.GetString(meta, "id", dirName);
                string name = JsonHelper.GetString(meta, "name", id);
                string subtitle = JsonHelper.GetString(meta, "brandSubtitle", JsonHelper.GetString(meta, "description", id));
                if (subtitle.Length > 42) subtitle = subtitle.Substring(0, 42);
                string appearance = JsonHelper.GetString(meta, "appearance", "light") == "dark" ? "dark" : "light";
                bool lg = JsonHelper.GetBool(meta, "liquidGlass", false) || id == "harmony-liquid-glass-lunar" || id.EndsWith("-liquid-glass");

                string safeId = id;
                char[] invalid = Path.GetInvalidFileNameChars();
                for (int j = 0; j < invalid.Length; j++) safeId = safeId.Replace(invalid[j], '_');

                string thumbPath = Path.Combine(thumbCacheDir, "agy_" + safeId + ".jpg");
                if (!File.Exists(thumbPath)) thumbPath = Path.Combine(thumbCacheDir, safeId + ".jpg");
                if (!File.Exists(thumbPath))
                {
                    string imgRel = JsonHelper.GetString(meta, "image", JsonHelper.GetString(meta, "background", ""));
                    if (!string.IsNullOrEmpty(imgRel))
                    {
                        string cand = Path.Combine(d, imgRel);
                        if (File.Exists(cand)) thumbPath = cand;
                    }
                }
                if (!File.Exists(thumbPath))
                {
                    string[] exts = new string[] { "*.jpg", "*.jpeg", "*.png", "*.webp" };
                    for (int e = 0; e < exts.Length; e++)
                    {
                        string[] hits = Directory.GetFiles(d, exts[e]);
                        if (hits.Length > 0) { thumbPath = hits[0]; break; }
                    }
                }

                ThemeCardInfo item = new ThemeCardInfo();
                item.Id = id;
                item.DirName = dirName;
                item.DirectoryPath = d;
                item.Name = name;
                item.Subtitle = subtitle;
                item.Appearance = appearance;
                item.LiquidGlass = lg;
                item.ThumbPath = File.Exists(thumbPath) ? thumbPath : null;
                item.DefaultTransparency = 80;
                list.Add(item);
            }

            list.Sort(delegate(ThemeCardInfo a, ThemeCardInfo b)
            {
                int lgCmp = b.LiquidGlass.CompareTo(a.LiquidGlass);
                if (lgCmp != 0) return lgCmp;
                return string.Compare(a.Name, b.Name, StringComparison.CurrentCultureIgnoreCase);
            });
            return list;
        }

        private void RefreshStateAndGrid(bool forceRebuild)
        {
            suppressUiEvents = true;
            try
            {
                UpdateTargetTabsVisual();

                Dictionary<string, object> codexMeta = JsonHelper.ReadDict(Path.Combine(stateRoot, "active-theme", "theme.json"));
                activeCodexId = JsonHelper.GetString(codexMeta, "id", "");

                Dictionary<string, object> agyMeta = JsonHelper.ReadDict(Path.Combine(agyRoot, "active-theme.json"));
                activeAgyId = JsonHelper.GetString(agyMeta, "themeId", "alpha-lock-liquid-glass");

                bool isAgy = selectedTarget == "antigravity";
                bool paused = File.Exists(isAgy ? Path.Combine(agyRoot, "paused") : Path.Combine(stateRoot, "paused"));
                int port = isAgy ? 9235 : 9335;
                bool portOpen = TestLoopbackPort(port);
                bool injRunning = IsStateInjectorRunning(isAgy ? Path.Combine(agyRoot, "state.json") : Path.Combine(stateRoot, "state.json"));

                if (paused)
                {
                    statusDotText.Foreground = BrushOf(Rgb(218, 138, 22));
                    statusLabelText.Text = isAgy ? "Antigravity：已暂停" : "Codex：已暂停";
                    pauseBtn.Content = "恢复显示皮肤";
                }
                else if (injRunning && portOpen)
                {
                    statusDotText.Foreground = BrushOf(Rgb(34, 168, 102));
                    statusLabelText.Text = isAgy ? "Antigravity：运行中 · 端口 9235" : "Codex：运行中 · 端口 9335";
                    pauseBtn.Content = "暂停皮肤";
                }
                else if (portOpen)
                {
                    statusDotText.Foreground = BrushOf(Rgb(47, 117, 195));
                    statusLabelText.Text = isAgy ? "Antigravity：调试端口已就绪" : "Codex：调试端口已就绪";
                    pauseBtn.Content = "暂停皮肤";
                }
                else
                {
                    statusDotText.Foreground = BrushOf(Rgb(138, 152, 176));
                    statusLabelText.Text = isAgy ? "Antigravity：未挂载" : "Codex：未运行";
                    pauseBtn.Content = "暂停皮肤";
                }

                string curId = isAgy ? activeAgyId : activeCodexId;
                themes = ScanThemes();
                string curName = string.IsNullOrEmpty(curId) ? "尚未应用" : curId;
                int defT = 80;
                StringBuilder catSig = new StringBuilder();
                catSig.Append(selectedTarget).Append("|").Append(curId).Append("|");
                for (int i = 0; i < themes.Count; i++)
                {
                    catSig.Append(themes[i].Id).Append(",");
                    if (themes[i].Id == curId || themes[i].DirName == curId)
                    {
                        curName = themes[i].Name;
                        defT = themes[i].DefaultTransparency;
                    }
                }
                currentThemeText.Text = "当前皮肤：" + curName;

                if (!draggingSlider)
                {
                    int tVal = ResolveTransparencyFor(curId, defT);
                    transparencySlider.Value = tVal;
                    transparencyValueText.Text = tVal + "%";
                }

                Dictionary<string, object> guard = JsonHelper.ReadDict(Path.Combine(stateRoot, "guard-config.json"));
                autoGuardChk.IsChecked = isAgy
                    ? JsonHelper.GetBool(guard, "antigravityAutoGuardEnabled", true)
                    : JsonHelper.GetBool(guard, "autoGuardEnabled", true);

                shortcutOptBtn.Visibility = Visibility.Visible;
                startupChk.IsChecked = File.Exists(startupShortcutPath);
                LoadOpticalPresetsUi();

                string fullSig = catSig.ToString();
                if (forceRebuild || fullSig != lastCatalogKey)
                {
                    lastCatalogKey = fullSig;
                    RebuildThemeGrid(curId);
                }
            }
            finally
            {
                suppressUiEvents = false;
            }
        }

        private void RebuildThemeGrid(string activeId)
        {
            themeGridPanel.Children.Clear();
            if (themes.Count == 0)
            {
                TextBlock empty = new TextBlock();
                empty.Text = "暂无主题，请点击下方“导入主题 ZIP…”或放入 %LOCALAPPDATA%\\JBYLiquidGlass\\themes。";
                empty.Foreground = BrushOf(Rgb(100, 114, 140));
                empty.Margin = new Thickness(8);
                themeGridPanel.Children.Add(empty);
                return;
            }

            for (int i = 0; i < themes.Count; i++)
            {
                ThemeCardInfo item = themes[i];
                bool isActive = (item.Id == activeId) || (item.DirName == activeId);

                Border card = new Border();
                card.Width = 224;
                card.Margin = new Thickness(6);
                card.CornerRadius = new CornerRadius(14);
                card.Padding = new Thickness(8);
                card.Cursor = Cursors.Hand;
                card.Background = isActive ? BrushOf(Rgb(240, 247, 255)) : BrushOf(Rgb(255, 255, 255));
                card.BorderBrush = isActive ? BrushOf(Rgb(47, 117, 195)) : BrushOf(Rgb(218, 226, 240));
                card.BorderThickness = new Thickness(isActive ? 2 : 1);

                StackPanel sp = new StackPanel();
                Border imgFrame = new Border();
                imgFrame.Height = 124;
                imgFrame.CornerRadius = new CornerRadius(10);
                imgFrame.ClipToBounds = true;
                imgFrame.Background = BrushOf(Rgb(22, 28, 44));

                Grid imgGrid = new Grid();
                if (!string.IsNullOrEmpty(item.ThumbPath))
                {
                    try
                    {
                        Image img = new Image();
                        img.Stretch = Stretch.UniformToFill;
                        BitmapImage bi = new BitmapImage();
                        bi.BeginInit();
                        bi.CacheOption = BitmapCacheOption.OnLoad;
                        bi.DecodePixelWidth = 240;
                        bi.UriSource = new Uri(item.ThumbPath, UriKind.Absolute);
                        bi.EndInit();
                        bi.Freeze();
                        img.Source = bi;
                        imgGrid.Children.Add(img);
                    }
                    catch { }
                }

                Border tagBadge = new Border();
                tagBadge.HorizontalAlignment = HorizontalAlignment.Left;
                tagBadge.VerticalAlignment = VerticalAlignment.Top;
                tagBadge.Margin = new Thickness(6);
                tagBadge.Padding = new Thickness(7, 2, 7, 2);
                tagBadge.CornerRadius = new CornerRadius(99);
                tagBadge.Background = BrushOf(Argb(185, 16, 24, 42));
                TextBlock tagTxt = new TextBlock();
                tagTxt.Text = item.LiquidGlass ? "液态玻璃" : (item.Appearance == "dark" ? "深色" : "浅色");
                tagTxt.Foreground = Brushes.White;
                tagTxt.FontSize = 10.5;
                tagBadge.Child = tagTxt;
                imgGrid.Children.Add(tagBadge);

                if (isActive)
                {
                    Border actBadge = new Border();
                    actBadge.HorizontalAlignment = HorizontalAlignment.Right;
                    actBadge.VerticalAlignment = VerticalAlignment.Top;
                    actBadge.Margin = new Thickness(6);
                    actBadge.Padding = new Thickness(8, 2, 8, 2);
                    actBadge.CornerRadius = new CornerRadius(99);
                    actBadge.Background = BrushOf(Rgb(47, 117, 195));
                    TextBlock actTxt = new TextBlock();
                    actTxt.Text = "当前使用";
                    actTxt.Foreground = Brushes.White;
                    actTxt.FontSize = 10.5;
                    actTxt.FontWeight = FontWeights.SemiBold;
                    actBadge.Child = actTxt;
                    imgGrid.Children.Add(actBadge);
                }

                imgFrame.Child = imgGrid;
                sp.Children.Add(imgFrame);

                TextBlock titleTxt = new TextBlock();
                titleTxt.Text = item.Name;
                titleTxt.FontSize = 13;
                titleTxt.FontWeight = FontWeights.SemiBold;
                titleTxt.Foreground = BrushOf(Rgb(16, 24, 42));
                titleTxt.TextTrimming = TextTrimming.CharacterEllipsis;
                titleTxt.Margin = new Thickness(2, 8, 2, 2);
                sp.Children.Add(titleTxt);

                TextBlock subTxt = new TextBlock();
                subTxt.Text = item.Subtitle;
                subTxt.FontSize = 11;
                subTxt.Foreground = BrushOf(Rgb(100, 114, 138));
                subTxt.TextTrimming = TextTrimming.CharacterEllipsis;
                subTxt.Margin = new Thickness(2, 0, 2, 2);
                sp.Children.Add(subTxt);

                card.Child = sp;

                ThemeCardInfo captured = item;
                card.MouseLeftButtonUp += delegate { RunApplyCurrentApp(captured.Id); };
                themeGridPanel.Children.Add(card);
            }
        }

        private void RunHiddenPowerShell(string scriptPath, string args, string hintText)
        {
            if (!File.Exists(scriptPath))
            {
                MessageBox.Show(this, "未找到脚本：\n" + scriptPath, "JBY Liquid Glass", MessageBoxButton.OK, MessageBoxImage.Warning);
                return;
            }
            footerHintText.Text = hintText;
            ProcessStartInfo psi = new ProcessStartInfo();
            psi.FileName = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System), "WindowsPowerShell\\v1.0\\powershell.exe");
            psi.Arguments = "-NoProfile -STA -WindowStyle Hidden -ExecutionPolicy RemoteSigned -File \"" + scriptPath + "\" " + args;
            psi.WorkingDirectory = engineRoot;
            psi.UseShellExecute = false;
            psi.CreateNoWindow = true;
            Process p = Process.Start(psi);
            ThreadPool.QueueUserWorkItem(delegate
            {
                try
                {
                    if (p != null) { p.WaitForExit(); p.Dispose(); }
                }
                catch { }
                Dispatcher.BeginInvoke(new Action(delegate
                {
                    RefreshStateAndGrid(true);
                    footerHintText.Text = "";
                }));
            });
        }

        private void RunApplyCurrentApp(string themeId)
        {
            if (selectedTarget == "antigravity")
            {
                try
                {
                    string pausePath = Path.Combine(agyRoot, "paused");
                    if (File.Exists(pausePath)) File.Delete(pausePath);
                    if (!string.IsNullOrEmpty(themeId))
                    {
                        Dictionary<string, object> payload = new Dictionary<string, object>();
                        payload["schemaVersion"] = 1;
                        payload["themeId"] = themeId;
                        payload["customImage"] = null;
                        payload["customVideo"] = null;
                        JsonHelper.WriteDictAtomic(Path.Combine(agyRoot, "active-theme.json"), payload);
                    }
                    bool injUp = IsStateInjectorRunning(Path.Combine(agyRoot, "state.json")) && TestLoopbackPort(9235);
                    if (injUp && !string.IsNullOrEmpty(themeId))
                    {
                        footerHintText.Text = "已切换 Antigravity 皮肤：" + themeId;
                        RefreshStateAndGrid(true);
                        return;
                    }
                }
                catch { }

                string script = Path.Combine(engineRoot, "scripts", "start-antigravity-dream-skin.ps1");
                string args = "-Port 9235 -PromptRestart" + (string.IsNullOrEmpty(themeId) ? "" : " -ThemeId \"" + themeId + "\"");
                RunHiddenPowerShell(script, args, "正在为 Antigravity 挂载液态玻璃皮肤...");
            }
            else
            {
                try
                {
                    string pausePath = Path.Combine(stateRoot, "paused");
                    if (File.Exists(pausePath)) File.Delete(pausePath);
                }
                catch { }

                string script = Path.Combine(engineRoot, "scripts", "start-dream-skin.ps1");
                string themeDir = "";
                if (!string.IsNullOrEmpty(themeId))
                {
                    for (int i = 0; i < themes.Count; i++)
                    {
                        if (themes[i].Id == themeId || themes[i].DirName == themeId)
                        {
                            themeDir = themes[i].DirectoryPath;
                            break;
                        }
                    }
                }
                string args = "-Port 9335 -PromptRestart" + (string.IsNullOrEmpty(themeDir) ? "" : " -SavedThemeDirectory \"" + themeDir + "\"");
                RunHiddenPowerShell(script, args, "正在为 Codex 应用主题...");
            }
        }

        private void TogglePauseCurrentApp()
        {
            if (selectedTarget == "antigravity")
            {
                string pausePath = Path.Combine(agyRoot, "paused");
                if (File.Exists(pausePath))
                {
                    try { File.Delete(pausePath); } catch { }
                    RunApplyCurrentApp("");
                }
                else
                {
                    Directory.CreateDirectory(agyRoot);
                    File.WriteAllText(pausePath, "paused\r\n", new UTF8Encoding(false));
                    footerHintText.Text = "已暂停 Antigravity 液态玻璃皮肤。";
                    RefreshStateAndGrid(false);
                }
            }
            else
            {
                string pausePath = Path.Combine(stateRoot, "paused");
                if (File.Exists(pausePath))
                {
                    try { File.Delete(pausePath); } catch { }
                    RunApplyCurrentApp("");
                }
                else
                {
                    Directory.CreateDirectory(stateRoot);
                    File.WriteAllText(pausePath, "paused\r\n", new UTF8Encoding(false));
                    footerHintText.Text = "已暂停 Codex 皮肤。";
                    RefreshStateAndGrid(false);
                }
            }
        }

        private void RunRestoreCurrentApp()
        {
            if (selectedTarget == "antigravity")
            {
                RunHiddenPowerShell(
                    Path.Combine(engineRoot, "scripts", "restore-antigravity-dream-skin.ps1"),
                    "-Port 9235",
                    "正在还原 Antigravity 原生外观...");
            }
            else
            {
                RunHiddenPowerShell(
                    Path.Combine(engineRoot, "scripts", "restore-dream-skin.ps1"),
                    "-Port 9335 -RestoreBaseTheme -PromptRestart",
                    "正在恢复 Codex 原生外观...");
            }
        }

        private void CommitTransparencyValue(int val)
        {
            int clamped = Math.Max(15, Math.Min(100, val));
            string curId = selectedTarget == "antigravity" ? activeAgyId : activeCodexId;
            if (string.IsNullOrEmpty(curId)) return;

            if (selectedTarget == "antigravity")
            {
                string cfgPath = Path.Combine(agyRoot, "plugin-config.json");
                Dictionary<string, object> cfg = JsonHelper.ReadDict(cfgPath) ?? new Dictionary<string, object>();
                cfg["schemaVersion"] = 2;
                Dictionary<string, object> th = JsonHelper.EnsureChildDict(cfg, "themes");
                Dictionary<string, object> entry = JsonHelper.EnsureChildDict(th, curId);
                entry["transparency"] = clamped;
                JsonHelper.WriteDictAtomic(cfgPath, cfg);

                string prefPath = Path.Combine(agyRoot, "theme-preferences.json");
                Dictionary<string, object> pref = JsonHelper.ReadDict(prefPath) ?? new Dictionary<string, object>();
                pref["schemaVersion"] = 1;
                th = JsonHelper.EnsureChildDict(pref, "themes");
                entry = JsonHelper.EnsureChildDict(th, curId);
                entry["transparency"] = clamped;
                JsonHelper.WriteDictAtomic(prefPath, pref);

                string actPath = Path.Combine(agyRoot, "active-theme.json");
                if (File.Exists(actPath))
                {
                    Dictionary<string, object> act = JsonHelper.ReadDict(actPath);
                    if (act != null) JsonHelper.WriteDictAtomic(actPath, act);
                }
            }
            else
            {
                string prefPath = Path.Combine(stateRoot, "theme-preferences.json");
                Dictionary<string, object> pref = JsonHelper.ReadDict(prefPath) ?? new Dictionary<string, object>();
                pref["schemaVersion"] = 1;
                Dictionary<string, object> th = JsonHelper.EnsureChildDict(pref, "themes");
                Dictionary<string, object> entry = JsonHelper.EnsureChildDict(th, curId);
                entry["transparency"] = clamped;
                JsonHelper.WriteDictAtomic(prefPath, pref);

                string cfgPath = Path.Combine(stateRoot, "dream-skin-plugin.json");
                if (File.Exists(cfgPath))
                {
                    Dictionary<string, object> cfg = JsonHelper.ReadDict(cfgPath) ?? new Dictionary<string, object>();
                    th = JsonHelper.EnsureChildDict(cfg, "themes");
                    entry = JsonHelper.EnsureChildDict(th, curId);
                    entry["transparency"] = clamped;
                    JsonHelper.WriteDictAtomic(cfgPath, cfg);
                }

                string actThemeJson = Path.Combine(stateRoot, "active-theme", "theme.json");
                if (File.Exists(actThemeJson))
                {
                    try { File.SetLastWriteTimeUtc(actThemeJson, DateTime.UtcNow); } catch { }
                }
            }
            footerHintText.Text = "通透度已保存：" + clamped + "%";
        }

        private void ToggleAutoGuard(bool enabled)
        {
            string guardPath = Path.Combine(stateRoot, "guard-config.json");
            Dictionary<string, object> cfg = JsonHelper.ReadDict(guardPath) ?? new Dictionary<string, object>();
            cfg["schemaVersion"] = 1;
            if (!cfg.ContainsKey("autoGuardEnabled")) cfg["autoGuardEnabled"] = true;
            if (!cfg.ContainsKey("autoLaunchCodexOnBoot")) cfg["autoLaunchCodexOnBoot"] = false;
            if (!cfg.ContainsKey("quietAttach")) cfg["quietAttach"] = true;
            cfg["checkIntervalMs"] = 1600;
            if (!cfg.ContainsKey("antigravityAutoGuardEnabled")) cfg["antigravityAutoGuardEnabled"] = true;
            if (!cfg.ContainsKey("autoLaunchAntigravityOnBoot")) cfg["autoLaunchAntigravityOnBoot"] = false;
            cfg["antigravityPort"] = 9235;

            if (selectedTarget == "antigravity") cfg["antigravityAutoGuardEnabled"] = enabled;
            else cfg["autoGuardEnabled"] = enabled;

            JsonHelper.WriteDictAtomic(guardPath, cfg);
            footerHintText.Text = enabled ? "已开启开机与重开自动挂载" : "已关闭自动挂载";
        }

        private void OptimizeAllAppShortcuts()
        {
            string conhost = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System), "conhost.exe").Replace("'", "''");
            string ps = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System), "WindowsPowerShell\\v1.0\\powershell.exe").Replace("'", "''");
            string agyLauncher = Path.Combine(engineRoot, "scripts", "launch-antigravity-with-jby.ps1").Replace("'", "''");
            string codexLauncher = Path.Combine(engineRoot, "scripts", "launch-codex-with-jby.ps1").Replace("'", "''");
            string codexIco = Path.Combine(engineRoot, "assets", "codex-app.ico").Replace("'", "''");
            string cmd =
                "$sh = New-Object -ComObject WScript.Shell; " +
                "$n = 0; " +
                "foreach ($p in @((Join-Path ([Environment]::GetFolderPath('Desktop')) 'Antigravity.lnk'), (Join-Path $env:APPDATA 'Microsoft\\Windows\\Start Menu\\Programs\\Antigravity.lnk'))) { " +
                "  if (Test-Path -LiteralPath $p -PathType Leaf) { " +
                "    $sc = $sh.CreateShortcut($p); " +
                "    $sc.TargetPath = '" + conhost + "'; " +
                "    $sc.Arguments = '--headless \"" + ps + "\" -NoProfile -STA -WindowStyle Hidden -ExecutionPolicy RemoteSigned -File \"" + agyLauncher + "\"'; " +
                "    $agyExe = Join-Path $env:LOCALAPPDATA 'Programs\\Antigravity\\Antigravity.exe'; if (!(Test-Path $agyExe)) { $agyExe = Join-Path $env:LOCALAPPDATA 'Programs\\antigravity\\Antigravity.exe' }; " +
                "    if (Test-Path $agyExe) { $sc.IconLocation = \"$agyExe,0\" }; " +
                "    $sc.Save(); $n++; " +
                "  } " +
                "}; " +
                "$gptLnk = Join-Path ([Environment]::GetFolderPath('Desktop')) 'ChatGPT.lnk'; " +
                "if (Test-Path -LiteralPath $gptLnk -PathType Leaf) { " +
                "  $sc = $sh.CreateShortcut($gptLnk); " +
                "  $sc.TargetPath = '" + conhost + "'; " +
                "  $sc.Arguments = '--headless \"" + ps + "\" -NoProfile -STA -WindowStyle Hidden -ExecutionPolicy RemoteSigned -File \"" + codexLauncher + "\"'; " +
                "  if (Test-Path '" + codexIco + "') { $sc.IconLocation = '" + codexIco + ",0' }; " +
                "  $sc.Save(); $n++; " +
                "}; Write-Output $n";
            RunPowerShellInline(cmd, "已优化 Antigravity 与 ChatGPT 桌面快捷方式（无终端窗口静默拉起托盘与皮肤）");
        }

        private void LoadOpticalPresetsUi()
        {
            if (presetCombo == null) return;
            string opPath = Path.Combine(stateRoot, "optical-presets.json");
            Dictionary<string, object> op = JsonHelper.ReadDict(opPath);
            string defId = op != null ? JsonHelper.GetString(op, "defaultPresetId", "") : "";
            System.Collections.ArrayList rawList = (op != null && op.ContainsKey("presets")) ? op["presets"] as System.Collections.ArrayList : null;

            StringBuilder sig = new StringBuilder();
            sig.Append(defId).Append("|");
            List<KeyValuePair<string, string>> entries = new List<KeyValuePair<string, string>>();
            if (rawList != null)
            {
                for (int i = 0; i < rawList.Count; i++)
                {
                    Dictionary<string, object> p = rawList[i] as Dictionary<string, object>;
                    if (p == null) continue;
                    string pid = JsonHelper.GetString(p, "id", "");
                    string pname = JsonHelper.GetString(p, "name", pid);
                    if (string.IsNullOrEmpty(pid)) continue;
                    string label = pid == defId ? ("★ " + pname + " (默认)") : pname;
                    entries.Add(new KeyValuePair<string, string>(pid, label));
                    sig.Append(pid).Append("=").Append(label).Append(";");
                }
            }

            string sVal = sig.ToString();
            if (sVal == lastPresetsKey) return;
            lastPresetsKey = sVal;

            string prevSel = null;
            ComboBoxItem curItem = presetCombo.SelectedItem as ComboBoxItem;
            if (curItem != null) prevSel = curItem.Tag as string;

            presetCombo.Items.Clear();
            int pickIdx = -1;
            for (int i = 0; i < entries.Count; i++)
            {
                ComboBoxItem ci = new ComboBoxItem();
                ci.Tag = entries[i].Key;
                ci.Content = entries[i].Value;
                presetCombo.Items.Add(ci);
                if (entries[i].Key == prevSel) pickIdx = i;
                else if (pickIdx < 0 && entries[i].Key == defId) pickIdx = i;
            }
            if (entries.Count > 0)
            {
                presetCombo.SelectedIndex = pickIdx >= 0 ? pickIdx : 0;
            }
        }

        private Dictionary<string, object> FindPresetParamsById(string presetId)
        {
            if (string.IsNullOrEmpty(presetId)) return null;
            Dictionary<string, object> op = JsonHelper.ReadDict(Path.Combine(stateRoot, "optical-presets.json"));
            if (op == null || !op.ContainsKey("presets")) return null;
            System.Collections.ArrayList rawList = op["presets"] as System.Collections.ArrayList;
            if (rawList == null) return null;
            for (int i = 0; i < rawList.Count; i++)
            {
                Dictionary<string, object> p = rawList[i] as Dictionary<string, object>;
                if (p != null && JsonHelper.GetString(p, "id", "") == presetId)
                {
                    return p.ContainsKey("params") ? p["params"] as Dictionary<string, object> : null;
                }
            }
            return null;
        }

        private void ApplySelectedPresetToCurrentApp()
        {
            ComboBoxItem sel = presetCombo != null ? presetCombo.SelectedItem as ComboBoxItem : null;
            string pid = sel != null ? sel.Tag as string : null;
            Dictionary<string, object> pParams = FindPresetParamsById(pid);
            if (pParams == null)
            {
                footerHintText.Text = "请先选择一个共享光学预设。";
                return;
            }
            string curId = selectedTarget == "antigravity" ? activeAgyId : activeCodexId;
            if (string.IsNullOrEmpty(curId))
            {
                footerHintText.Text = "当前端尚未激活主题，无法写入参数。";
                return;
            }
            int alpha = Math.Max(15, Math.Min(100, JsonHelper.GetInt(pParams, "transparency", 80)));

            if (selectedTarget == "antigravity")
            {
                string cfgPath = Path.Combine(agyRoot, "plugin-config.json");
                Dictionary<string, object> cfg = JsonHelper.ReadDict(cfgPath) ?? new Dictionary<string, object>();
                cfg["schemaVersion"] = 2;
                Dictionary<string, object> th = JsonHelper.EnsureChildDict(cfg, "themes");
                th[curId] = pParams;
                JsonHelper.WriteDictAtomic(cfgPath, cfg);

                string prefPath = Path.Combine(agyRoot, "theme-preferences.json");
                Dictionary<string, object> pref = JsonHelper.ReadDict(prefPath) ?? new Dictionary<string, object>();
                pref["schemaVersion"] = 1;
                th = JsonHelper.EnsureChildDict(pref, "themes");
                Dictionary<string, object> pEntry = JsonHelper.EnsureChildDict(th, curId);
                pEntry["transparency"] = alpha;
                JsonHelper.WriteDictAtomic(prefPath, pref);

                string actPath = Path.Combine(agyRoot, "active-theme.json");
                if (File.Exists(actPath))
                {
                    Dictionary<string, object> act = JsonHelper.ReadDict(actPath);
                    if (act != null) JsonHelper.WriteDictAtomic(actPath, act);
                }
            }
            else
            {
                string prefPath = Path.Combine(stateRoot, "theme-preferences.json");
                Dictionary<string, object> pref = JsonHelper.ReadDict(prefPath) ?? new Dictionary<string, object>();
                pref["schemaVersion"] = 1;
                Dictionary<string, object> th = JsonHelper.EnsureChildDict(pref, "themes");
                Dictionary<string, object> pEntry = JsonHelper.EnsureChildDict(th, curId);
                pEntry["transparency"] = alpha;
                JsonHelper.WriteDictAtomic(prefPath, pref);

                string cfgPath = Path.Combine(stateRoot, "dream-skin-plugin.json");
                Dictionary<string, object> cfg = JsonHelper.ReadDict(cfgPath) ?? new Dictionary<string, object>();
                cfg["schemaVersion"] = 1;
                th = JsonHelper.EnsureChildDict(cfg, "themes");
                th[curId] = pParams;
                JsonHelper.WriteDictAtomic(cfgPath, cfg);

                string actThemeJson = Path.Combine(stateRoot, "active-theme", "theme.json");
                if (File.Exists(actThemeJson))
                {
                    try { File.SetLastWriteTimeUtc(actThemeJson, DateTime.UtcNow); } catch { }
                }
            }
            footerHintText.Text = "已将预设参数应用到 " + (selectedTarget == "antigravity" ? "Antigravity" : "Codex");
            RefreshStateAndGrid(false);
        }

        private void SetSelectedPresetAsDefault()
        {
            ComboBoxItem sel = presetCombo != null ? presetCombo.SelectedItem as ComboBoxItem : null;
            string pid = sel != null ? sel.Tag as string : null;
            if (string.IsNullOrEmpty(pid))
            {
                footerHintText.Text = "请先选择一个要设为默认的预设。";
                return;
            }
            string opPath = Path.Combine(stateRoot, "optical-presets.json");
            Dictionary<string, object> op = JsonHelper.ReadDict(opPath);
            if (op == null) return;
            op["schemaVersion"] = 1;
            op["defaultPresetId"] = pid;
            JsonHelper.WriteDictAtomic(opPath, op);
            lastPresetsKey = "";
            LoadOpticalPresetsUi();
            footerHintText.Text = "已设为主用默认预设（新皮肤与双端将自动继承）。";
        }

        private void SaveCurrentAsNewPreset()
        {
            string curId = selectedTarget == "antigravity" ? activeAgyId : activeCodexId;
            Dictionary<string, object> cfg = JsonHelper.ReadDict(selectedTarget == "antigravity"
                ? Path.Combine(agyRoot, "plugin-config.json")
                : Path.Combine(stateRoot, "dream-skin-plugin.json"));
            Dictionary<string, object> th = (cfg != null && cfg.ContainsKey("themes")) ? cfg["themes"] as Dictionary<string, object> : null;
            Dictionary<string, object> curParams = (th != null && !string.IsNullOrEmpty(curId) && th.ContainsKey(curId))
                ? th[curId] as Dictionary<string, object>
                : null;
            if (curParams == null)
            {
                curParams = new Dictionary<string, object>();
                curParams["transparency"] = (int)Math.Round(transparencySlider.Value);
                curParams["refractScale"] = 100;
                curParams["blurScale"] = 100;
                curParams["rimIntensity"] = 100;
                curParams["fontWeightBoost"] = 0;
                curParams["motionMode"] = "spring";
                curParams["particlesEnabled"] = true;
                curParams["zones"] = new Dictionary<string, object>();
            }

            string opPath = Path.Combine(stateRoot, "optical-presets.json");
            Dictionary<string, object> op = JsonHelper.ReadDict(opPath) ?? new Dictionary<string, object>();
            op["schemaVersion"] = 1;
            System.Collections.ArrayList arr = (op.ContainsKey("presets") ? op["presets"] as System.Collections.ArrayList : null)
                ?? new System.Collections.ArrayList();
            int nextNum = 1;
            for (int attempt = 1; attempt <= 999; attempt++)
            {
                string cand = "预设 " + attempt;
                bool used = false;
                for (int i = 0; i < arr.Count; i++)
                {
                    Dictionary<string, object> item = arr[i] as Dictionary<string, object>;
                    string existingName = item != null ? JsonHelper.GetString(item, "name", "") : "";
                    if (existingName == cand || existingName.StartsWith(cand + " ")) { used = true; break; }
                }
                if (!used) { nextNum = attempt; break; }
            }

            string newId = "preset-" + DateTime.UtcNow.Ticks.ToString();
            string newName = "预设 " + nextNum;
            Dictionary<string, object> rec = new Dictionary<string, object>();
            rec["id"] = newId;
            rec["name"] = newName;
            rec["updatedAt"] = DateTime.UtcNow.ToString("o");
            rec["params"] = curParams;
            arr.Add(rec);
            op["presets"] = arr;
            if (!op.ContainsKey("defaultPresetId") || op["defaultPresetId"] == null) op["defaultPresetId"] = newId;
            JsonHelper.WriteDictAtomic(opPath, op);

            lastPresetsKey = "";
            LoadOpticalPresetsUi();
            footerHintText.Text = "已保存共享预设：" + newName;
        }

        private void PushCurrentThemeToBoth()
        {
            string curId = selectedTarget == "antigravity" ? activeAgyId : activeCodexId;
            string srcDir = null;
            for (int i = 0; i < themes.Count; i++)
            {
                if (themes[i].Id == curId || themes[i].DirName == curId)
                {
                    srcDir = themes[i].DirectoryPath;
                    curId = themes[i].Id;
                    break;
                }
            }
            if (string.IsNullOrEmpty(srcDir) || !Directory.Exists(srcDir))
            {
                footerHintText.Text = "共享主题库未找到当前主题，请从下方卡片点击选择主题。";
                return;
            }

            try
            {
                string agyPause = Path.Combine(agyRoot, "paused");
                if (File.Exists(agyPause)) File.Delete(agyPause);
                Dictionary<string, object> payload = new Dictionary<string, object>();
                payload["schemaVersion"] = 1;
                payload["themeId"] = curId;
                payload["customImage"] = null;
                payload["customVideo"] = null;
                JsonHelper.WriteDictAtomic(Path.Combine(agyRoot, "active-theme.json"), payload);

                string codexPause = Path.Combine(stateRoot, "paused");
                if (File.Exists(codexPause)) File.Delete(codexPause);
                string activeCodexDir = Path.Combine(stateRoot, "active-theme");
                if (Directory.Exists(activeCodexDir)) Directory.Delete(activeCodexDir, true);
                CopyDirStatic(srcDir, activeCodexDir);
                string actThemeJson = Path.Combine(activeCodexDir, "theme.json");
                if (File.Exists(actThemeJson)) File.SetLastWriteTimeUtc(actThemeJson, DateTime.UtcNow);

                footerHintText.Text = "已将该皮肤同步推送至 Codex 与 Antigravity 双端：" + curId;
                RefreshStateAndGrid(true);
            }
            catch (Exception ex)
            {
                footerHintText.Text = "双端推送失败：" + ex.Message;
            }
        }

        private static void CopyDirStatic(string src, string dst)
        {
            Directory.CreateDirectory(dst);
            string[] files = Directory.GetFiles(src);
            for (int i = 0; i < files.Length; i++)
            {
                File.Copy(files[i], Path.Combine(dst, Path.GetFileName(files[i])), true);
            }
            string[] dirs = Directory.GetDirectories(src);
            for (int i = 0; i < dirs.Length; i++)
            {
                CopyDirStatic(dirs[i], Path.Combine(dst, Path.GetFileName(dirs[i])));
            }
        }

        private void SetStartupShortcut(bool enabled)
        {
            string baseDir = Program.ResolveInstallBaseDir();
            string bootstrap = Path.Combine(baseDir, "setup-bootstrap.ps1");
            string tray = Path.Combine(engineRoot, "scripts", "tray-jby-liquid-glass.ps1");
            string psRaw = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System), "WindowsPowerShell\\v1.0\\powershell.exe");
            string argsLine = File.Exists(bootstrap)
                ? "--headless \"" + psRaw + "\" -NoProfile -STA -WindowStyle Hidden -ExecutionPolicy RemoteSigned -File \"" + bootstrap + "\" -LaunchTray"
                : "--headless \"" + psRaw + "\" -NoProfile -STA -WindowStyle Hidden -ExecutionPolicy RemoteSigned -File \"" + tray + "\"";
            string ico = Path.Combine(engineRoot, "assets", "jby-liquid-glass.ico");
            if (!File.Exists(ico)) ico = Path.Combine(baseDir, "payload", "assets", "jby-liquid-glass.ico");

            string escPath = startupShortcutPath.Replace("'", "''");
            string cmd;
            if (!enabled)
            {
                cmd = "Remove-Item -LiteralPath '" + escPath + "' -Force -ErrorAction SilentlyContinue";
                RunPowerShellInline(cmd, "已取消开机自启。");
            }
            else
            {
                string conhostExe = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System), "conhost.exe").Replace("'", "''");
                cmd =
                    "$sh = New-Object -ComObject WScript.Shell; " +
                    "$sc = $sh.CreateShortcut('" + escPath + "'); " +
                    "$sc.TargetPath = '" + conhostExe + "'; " +
                    "$sc.Arguments = '" + argsLine.Replace("'", "''") + "'; " +
                    "$sc.WorkingDirectory = '" + baseDir.TrimEnd('\\').Replace("'", "''") + "'; " +
                    "$sc.Description = 'Start JBY Liquid Glass in notification area'; " +
                    (File.Exists(ico) ? "$sc.IconLocation = '" + ico.Replace("'", "''") + ",0'; " : "") +
                    "$sc.Save()";
                RunPowerShellInline(cmd, "已开启开机自启统一托盘。");
            }
        }

        private void RunPowerShellInline(string commandText, string successMsg)
        {
            ProcessStartInfo psi = new ProcessStartInfo();
            psi.FileName = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System), "WindowsPowerShell\\v1.0\\powershell.exe");
            psi.Arguments = "-NoProfile -WindowStyle Hidden -ExecutionPolicy RemoteSigned -Command \"" + commandText.Replace("\"", "\\\"") + "\"";
            psi.UseShellExecute = false;
            psi.CreateNoWindow = true;
            using (Process p = Process.Start(psi))
            {
                if (p != null) p.WaitForExit();
            }
            footerHintText.Text = successMsg;
            RefreshStateAndGrid(false);
        }

        private void ImportThemeZip()
        {
            Win32OpenFileDialog dlg = new Win32OpenFileDialog();
            dlg.Title = "选择主题包 (.zip) — 支持商店主题自动转换液态玻璃";
            dlg.Filter = "主题压缩包 (*.zip)|*.zip";
            if (dlg.ShowDialog(this) != true) return;

            string importer = Path.Combine(engineRoot, "scripts", "import-theme-zip.ps1");
            if (!File.Exists(importer))
            {
                footerHintText.Text = "缺少导入脚本：" + importer;
                return;
            }

            bool convertLg = autoLgImportChk == null || autoLgImportChk.IsChecked == true;
            int pushIdx = importPushCombo != null ? importPushCombo.SelectedIndex : 0;
            string target = pushIdx == 0 ? "both" : (pushIdx == 1 ? selectedTarget : "none");

            string args = "-NoProfile -ExecutionPolicy RemoteSigned -File \"" + importer + "\" -ArchivePath \"" + dlg.FileName + "\" -StateRoot \"" + stateRoot + "\" -Target " + target + (convertLg ? " -ConvertToLiquidGlass" : "");
            ProcessStartInfo psi = new ProcessStartInfo();
            psi.FileName = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System), "WindowsPowerShell\\v1.0\\powershell.exe");
            psi.Arguments = args;
            psi.UseShellExecute = false;
            psi.RedirectStandardOutput = true;
            psi.RedirectStandardError = true;
            psi.CreateNoWindow = true;
            using (Process p = Process.Start(psi))
            {
                string outTxt = p.StandardOutput.ReadToEnd();
                string errTxt = p.StandardError.ReadToEnd();
                p.WaitForExit();
                if (p.ExitCode != 0)
                {
                    MessageBox.Show("导入主题失败：\r\n" + errTxt, "JBY Liquid Glass", MessageBoxButton.OK, MessageBoxImage.Error);
                    return;
                }
                string msg = target == "both"
                    ? "已完成" + (convertLg ? "液态玻璃化并同步推送双端" : "导入并推送双端")
                    : (target == "none"
                        ? "已导入共享主题库" + (convertLg ? "（已自动转液态玻璃）" : "")
                        : "已完成导入并推送到 " + (target == "antigravity" ? "Antigravity" : "Codex"));
                footerHintText.Text = msg;
            }
            RefreshStateAndGrid(true);
        }

        private void PickCustomMedia()
        {
            Win32OpenFileDialog dlg = new Win32OpenFileDialog();
            dlg.Title = selectedTarget == "antigravity" ? "选择 Antigravity 自定义壁纸或视频" : "选择 Codex 自定义背景图片";
            dlg.Filter = selectedTarget == "antigravity"
                ? "图片或视频|*.png;*.jpg;*.jpeg;*.webp;*.mp4;*.webm|所有文件|*.*"
                : "图片文件|*.png;*.jpg;*.jpeg;*.webp|所有文件|*.*";
            if (dlg.ShowDialog(this) != true) return;

            string ext = Path.GetExtension(dlg.FileName).ToLowerInvariant();
            if (selectedTarget == "antigravity")
            {
                string mediaDir = Path.Combine(agyRoot, "custom-media");
                Directory.CreateDirectory(mediaDir);
                string dst = Path.Combine(mediaDir, "app-" + DateTime.Now.ToString("yyyyMMddHHmmss") + ext);
                File.Copy(dlg.FileName, dst, true);
                Dictionary<string, object> cur = JsonHelper.ReadDict(Path.Combine(agyRoot, "active-theme.json")) ?? new Dictionary<string, object>();
                string tid = JsonHelper.GetString(cur, "themeId", "alpha-lock-liquid-glass");
                bool isVid = ext == ".mp4" || ext == ".webm" || ext == ".mov";
                Dictionary<string, object> next = new Dictionary<string, object>();
                next["schemaVersion"] = 1;
                next["themeId"] = tid;
                next["customImage"] = isVid ? cur.ContainsKey("customImage") ? cur["customImage"] : null : dst;
                next["customVideo"] = isVid ? dst : null;
                JsonHelper.WriteDictAtomic(Path.Combine(agyRoot, "active-theme.json"), next);
                footerHintText.Text = "已更新 Antigravity 自定义背景。";
            }
            else
            {
                string imagesDir = Path.Combine(stateRoot, "images");
                Directory.CreateDirectory(imagesDir);
                string dst = Path.Combine(imagesDir, "custom-" + DateTime.Now.ToString("yyyyMMddHHmmss") + ext);
                File.Copy(dlg.FileName, dst, true);
                string activeImg = Path.Combine(stateRoot, "active-theme", "background" + ext);
                if (Directory.Exists(Path.Combine(stateRoot, "active-theme")))
                {
                    File.Copy(dst, activeImg, true);
                    string tj = Path.Combine(stateRoot, "active-theme", "theme.json");
                    Dictionary<string, object> meta = JsonHelper.ReadDict(tj);
                    if (meta != null)
                    {
                        meta["image"] = "background" + ext;
                        JsonHelper.WriteDictAtomic(tj, meta);
                    }
                }
                footerHintText.Text = "已更新 Codex 背景图片。";
            }
            RefreshStateAndGrid(false);
        }
    }

    public static class Program
    {
        public static string ResolveInstallBaseDir()
        {
            string envDir = Environment.GetEnvironmentVariable("JBY_LIQUID_GLASS_BASE_DIR");
            if (!string.IsNullOrEmpty(envDir) && Directory.Exists(envDir))
            {
                return envDir;
            }
            string progDir = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "Programs",
                "JBYLiquidGlass");
            if (Directory.Exists(progDir))
            {
                return progDir;
            }
            return AppDomain.CurrentDomain.BaseDirectory;
        }

        private static void SeedFromLegacyIfNeeded(string stateRoot)
        {
            string legacy = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "CodexDreamSkin");
            string newThemes = Path.Combine(stateRoot, "themes");
            if (Directory.Exists(Path.Combine(legacy, "themes")) && !Directory.Exists(newThemes))
            {
                Directory.CreateDirectory(stateRoot);
                string[] dirs = new string[] { "themes", "thumb-cache", "images", "active-theme", "antigravity" };
                for (int i = 0; i < dirs.Length; i++)
                {
                    string s = Path.Combine(legacy, dirs[i]);
                    string d = Path.Combine(stateRoot, dirs[i]);
                    if (Directory.Exists(s) && !Directory.Exists(d)) CopyDir(s, d);
                }
                string[] files = new string[] { "dream-skin-plugin.json", "theme-preferences.json", "guard-config.json", "config.before-dream-skin.toml", "language.txt" };
                for (int i = 0; i < files.Length; i++)
                {
                    string s = Path.Combine(legacy, files[i]);
                    string d = Path.Combine(stateRoot, files[i]);
                    if (File.Exists(s) && !File.Exists(d)) File.Copy(s, d, false);
                }
            }
        }

        private static void CopyDir(string src, string dst)
        {
            Directory.CreateDirectory(dst);
            string[] files = Directory.GetFiles(src);
            for (int i = 0; i < files.Length; i++)
            {
                File.Copy(files[i], Path.Combine(dst, Path.GetFileName(files[i])), false);
            }
            string[] subdirs = Directory.GetDirectories(src);
            for (int i = 0; i < subdirs.Length; i++)
            {
                CopyDir(subdirs[i], Path.Combine(dst, Path.GetFileName(subdirs[i])));
            }
        }

        private static string ResolveEngineRoot(string stateRoot)
        {
            string baseDir = ResolveInstallBaseDir();
            string eng = Path.Combine(stateRoot, "engine");
            if (File.Exists(Path.Combine(eng, "scripts", "tray-jby-liquid-glass.ps1"))) return eng;
            string pay = Path.Combine(baseDir, "payload");
            if (File.Exists(Path.Combine(pay, "scripts", "tray-jby-liquid-glass.ps1"))) return pay;
            DirectoryInfo parent = Directory.GetParent(baseDir.TrimEnd('\\'));
            if (parent != null && File.Exists(Path.Combine(parent.FullName, "scripts", "tray-jby-liquid-glass.ps1"))) return parent.FullName;
            return eng;
        }

        private static void EnsureTrayRunning(string sid, string engineRoot)
        {
            try
            {
                using (Mutex trayMutex = new Mutex(false, "Local\\JBYLiquidGlass." + sid + ".Tray"))
                {
                    bool free = false;
                    try { free = trayMutex.WaitOne(0); } catch (AbandonedMutexException) { free = true; }
                    if (free)
                    {
                        try { trayMutex.ReleaseMutex(); } catch { }
                        string tray = Path.Combine(engineRoot, "scripts", "tray-jby-liquid-glass.ps1");
                        if (File.Exists(tray))
                        {
                            string conhost = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System), "conhost.exe");
                            string psExe = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System), "WindowsPowerShell\\v1.0\\powershell.exe");
                            ProcessStartInfo psi = new ProcessStartInfo();
                            psi.FileName = conhost;
                            psi.Arguments = "--headless \"" + psExe + "\" -NoProfile -STA -WindowStyle Hidden -ExecutionPolicy RemoteSigned -File \"" + tray + "\"";
                            psi.WorkingDirectory = engineRoot;
                            psi.UseShellExecute = false;
                            psi.CreateNoWindow = true;
                            Process.Start(psi);
                        }
                    }
                }
            }
            catch { }
        }

        [STAThread]
        public static int Run(string[] args)
        {
            bool isSmokeTest = false;
            if (args != null)
            {
                for (int i = 0; i < args.Length; i++)
                {
                    if (string.Equals(args[i], "--smoke-test", StringComparison.OrdinalIgnoreCase)) isSmokeTest = true;
                }
            }

            string sid = WindowsIdentity.GetCurrent().User.Value;
            string stateRoot = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "JBYLiquidGlass");
            SeedFromLegacyIfNeeded(stateRoot);
            string engineRoot = ResolveEngineRoot(stateRoot);

            bool acquired = false;
            using (Mutex mgrMutex = new Mutex(false, "Local\\JBYLiquidGlass." + sid + ".Manager"))
            using (EventWaitHandle showEvt = new EventWaitHandle(false, EventResetMode.AutoReset, "Local\\JBYLiquidGlass." + sid + ".ManagerShow"))
            {
                try { acquired = mgrMutex.WaitOne(0); } catch (AbandonedMutexException) { acquired = true; }
                if (!acquired)
                {
                    showEvt.Set();
                    return 0;
                }

                try
                {
                    if (!isSmokeTest) EnsureTrayRunning(sid, engineRoot);

                    Application app = new Application();
                    MainWindow win = new MainWindow(stateRoot, engineRoot, isSmokeTest);
                    DispatcherTimer actTimer = new DispatcherTimer();
                    actTimer.Interval = TimeSpan.FromMilliseconds(200);
                    actTimer.Tick += delegate
                    {
                        if (showEvt.WaitOne(0))
                        {
                            if (win.WindowState == WindowState.Minimized) win.WindowState = WindowState.Normal;
                            win.Show();
                            win.Activate();
                        }
                    };
                    actTimer.Start();
                    app.Run(win);
                    actTimer.Stop();
                    return 0;
                }
                finally
                {
                    if (acquired) { try { mgrMutex.ReleaseMutex(); } catch { } }
                }
            }
        }

        [STAThread]
        private static int Main(string[] args)
        {
            return Run(args);
        }
    }
}
