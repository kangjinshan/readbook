package com.readbook.tv.ui.reader

import android.annotation.SuppressLint
import android.content.Intent
import android.graphics.Color
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.util.Log
import android.util.TypedValue
import android.view.Gravity
import android.view.KeyEvent
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import com.bumptech.glide.Glide
import com.bumptech.glide.load.model.GlideUrl
import com.bumptech.glide.load.model.LazyHeaders
import com.readbook.tv.ReadBookApp
import com.readbook.tv.data.api.ApiClient
import com.readbook.tv.data.model.Bookmark
import com.readbook.tv.data.model.Chapter
import com.readbook.tv.data.model.ReaderContentBlocksJson
import com.readbook.tv.data.model.ReaderRenderCssJson
import com.readbook.tv.data.repository.BookRepository
import com.readbook.tv.databinding.ActivityReaderBinding
import com.readbook.tv.databinding.ItemReaderBookmarkBinding
import com.readbook.tv.service.AntiAddictionService
import com.readbook.tv.service.ReadingControlCoordinator
import com.readbook.tv.service.ReadingGateGuards
import com.readbook.tv.service.ReadingGateState
import com.readbook.tv.service.SyncService
import com.readbook.tv.ui.lock.LockActivity
import com.readbook.tv.ui.lock.LockDurationFormatter
import com.readbook.tv.util.AppBrightnessController
import com.readbook.tv.util.FontSize
import com.readbook.tv.util.PreferenceManager
import com.readbook.tv.util.RemoteControlHandler
import com.readbook.tv.util.Theme
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import android.view.View.MeasureSpec
import kotlin.coroutines.resume
import kotlin.math.roundToInt

/**
 * 阅读器页面
 * 使用当前章节全文在本地按真实视口分页，避免服务端固定字符切页造成断句和半行。
 */
class ReaderActivity : AppCompatActivity(), RemoteControlHandler.RemoteControlCallback {

    private lateinit var binding: ActivityReaderBinding
    private lateinit var bookRepository: BookRepository
    private lateinit var preferenceManager: PreferenceManager
    private lateinit var readingControlCoordinator: ReadingControlCoordinator
    private lateinit var remoteControlHandler: RemoteControlHandler

    private var bookId: Long = 0
    private var totalPages: Int = 0
    private var currentPage = 1
    private var currentChapter = 1
    private var currentLocalPageIndex = 0
    private var pageContent: String = ""
    private var chapters: List<Chapter> = emptyList()
    private var currentChapterMeta: Chapter? = null
    private var currentChapterPages: List<ReaderPage> = emptyList()
    private var currentHtmlChapter: HtmlChapterDocument? = null
    private var currentHtmlPageCount: Int = 0
    private var activeRenderMode = ReaderRenderMode.NATIVE

    private var isMenuVisible = false
    private val menuHandler = Handler(Looper.getMainLooper())
    private val menuHideRunnable = Runnable { hideMenu() }
    private var bookmarks: List<Bookmark> = emptyList()
    private var activeMenuTab = MenuTab.SETTINGS
    private var isNavigatingToLock = false
    private var hasLoadedProgressState = false
    private var remainingBaseTodaySeconds = 0L
    private var remainingBaseContinuousSeconds = 0L
    private var remainingBaseDate: String? = null
    private var remainingTimerStartedAtMs = 0L
    private val remainingTimeHandler = Handler(Looper.getMainLooper())
    private val remainingTimeRunnable = object : Runnable {
        override fun run() {
            refreshRemainingTimeDisplay()
            remainingTimeHandler.postDelayed(this, 1000L)
        }
    }

    companion object {
        private const val TAG = "ReaderActivity"
        private const val PREFS_READER_POSITION = "reader_local_position"
        const val EXTRA_BOOK_ID = "book_id"
        const val EXTRA_BOOK_TITLE = "book_title"
        const val EXTRA_TOTAL_PAGES = "total_pages"
    }

    private enum class MenuTab {
        SETTINGS,
        BOOKMARKS
    }

    private enum class ReaderRenderMode {
        NATIVE,
        XHTML
    }

    private sealed interface ReaderLayoutBlock {
        data class Text(val text: String) : ReaderLayoutBlock
        data class Image(
            val assetUrl: String,
            val alt: String?,
            val width: Int?,
            val height: Int?,
            val widthPercent: Float?,
        ) : ReaderLayoutBlock
    }

    private data class ReaderPage(
        val elements: List<PageElement>,
        val allowsVerticalScroll: Boolean = false,
    ) {
        fun previewText(): String? =
            elements.firstNotNullOfOrNull { element ->
                when (element) {
                    is PageElement.Text -> element.text
                    is PageElement.Image -> element.alt
                }
            }
    }

    private sealed interface PageElement {
        data class Text(val text: String) : PageElement
        data class Image(
            val assetUrl: String,
            val alt: String?,
            val displayWidthPx: Int,
            val displayHeightPx: Int,
        ) : PageElement
    }

    private data class HtmlChapterDocument(
        val baseUrl: String,
        val html: String,
        val cssTexts: List<String>,
    )

    private var onHtmlLayoutReady: ((Int) -> Unit)? = null

    private inner class ReaderWebBridge {
        @JavascriptInterface
        fun onLayoutReady(pageCount: String?) {
            val resolvedPageCount = pageCount?.toIntOrNull()?.coerceAtLeast(1) ?: 1
            runOnUiThread {
                onHtmlLayoutReady?.invoke(resolvedPageCount)
                onHtmlLayoutReady = null
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val app = application as ReadBookApp
        app.refreshReadingStateForToday()
        AppBrightnessController.applyWindowBackground(
            activity = this,
            preferenceManager = app.preferenceManager,
            theme = app.preferenceManager.theme
        )
        binding = ActivityReaderBinding.inflate(layoutInflater)
        setContentView(binding.root)
        bookRepository = app.bookRepository
        preferenceManager = app.preferenceManager
        readingControlCoordinator = app.readingControlCoordinator
        remoteControlHandler = RemoteControlHandler(this)

        bookId = intent.getLongExtra(EXTRA_BOOK_ID, 0)
        totalPages = intent.getIntExtra(EXTRA_TOTAL_PAGES, 1)

        if (!ensureReadingAllowedOrExit()) {
            return
        }

        applyTheme()
        applyBrightness()
        applyFontSize()
        startRemainingTimeTicker()
        setupRemoteControl()
        setupChapterWebView()
        setupMenuButtons()
        loadBookmarks()

        lifecycleScope.launch {
            repeatOnLifecycle(Lifecycle.State.STARTED) {
                readingControlCoordinator.state.collect { state ->
                    if (!ReadingGateGuards.canEnterReader(state)) {
                        closeReadingAndShowLock(state)
                    }
                }
            }
        }

        lifecycleScope.launch {
            loadProgress()
            hasLoadedProgressState = true
            loadCurrentChapterContent()
            SyncService.startSession(this@ReaderActivity, bookId, currentPage)
            SyncService.updateCurrentPage(this@ReaderActivity, currentPage)
            AntiAddictionService.startTimer(this@ReaderActivity)
        }
    }

    override fun onDestroy() {
        if (hasLoadedProgressState) {
            runBlocking {
                bookRepository.updateCurrentPage(bookId, currentPage)
                saveLocalReaderPosition()
            }
        }
        SyncService.endSession(this)
        AntiAddictionService.stopTimer(this)
        remainingTimeHandler.removeCallbacks(remainingTimeRunnable)
        menuHandler.removeCallbacks(menuHideRunnable)
        super.onDestroy()
    }

    override fun onResume() {
        super.onResume()
        ensureReadingAllowedOrExit()
    }

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        if (event.keyCode == KeyEvent.KEYCODE_DPAD_LEFT
            || event.keyCode == KeyEvent.KEYCODE_DPAD_RIGHT
            || event.keyCode == KeyEvent.KEYCODE_DPAD_UP
            || event.keyCode == KeyEvent.KEYCODE_DPAD_DOWN
        ) {
            Log.d(TAG, "dispatchKeyEvent action=${event.action} keyCode=${event.keyCode} renderMode=$activeRenderMode")
        }
        if (isMenuVisible) {
            if (event.action == KeyEvent.ACTION_DOWN && ReaderMenuAutoHide.shouldResetOnKey(event.keyCode)) {
                restartMenuAutoHide()
            }
            if (ReaderMenuAutoHide.shouldCloseMenu(event.keyCode, event.action)) {
                hideMenu()
                return true
            }
            if (ReaderMenuAutoHide.shouldToggleMenu(event.keyCode, event.action)) {
                hideMenu()
                return true
            }
            if (ReaderMenuAutoHide.shouldKeepInReaderLayer(event.keyCode)) {
                return true
            }

            return super.dispatchKeyEvent(event)
        }

        if (remoteControlHandler.onKey(binding.root, event.keyCode, event)) {
            return true
        }

        return super.dispatchKeyEvent(event)
    }

    override fun onKeyDown(keyCode: Int, event: KeyEvent): Boolean {
        if (isMenuVisible) {
            return super.onKeyDown(keyCode, event)
        }
        if (
            keyCode == KeyEvent.KEYCODE_DPAD_LEFT
            || keyCode == KeyEvent.KEYCODE_DPAD_RIGHT
            || keyCode == KeyEvent.KEYCODE_DPAD_UP
            || keyCode == KeyEvent.KEYCODE_DPAD_DOWN
            || keyCode == KeyEvent.KEYCODE_DPAD_CENTER
            || keyCode == KeyEvent.KEYCODE_ENTER
            || keyCode == KeyEvent.KEYCODE_BACK
            || keyCode == KeyEvent.KEYCODE_MENU
        ) {
            Log.d(TAG, "onKeyDown keyCode=$keyCode renderMode=$activeRenderMode")
            if (remoteControlHandler.onKey(binding.root, keyCode, event)) {
                return true
            }
        }
        return super.onKeyDown(keyCode, event)
    }

    override fun onKeyUp(keyCode: Int, event: KeyEvent): Boolean {
        if (isMenuVisible) {
            return super.onKeyUp(keyCode, event)
        }
        if (
            keyCode == KeyEvent.KEYCODE_DPAD_LEFT
            || keyCode == KeyEvent.KEYCODE_DPAD_RIGHT
            || keyCode == KeyEvent.KEYCODE_DPAD_UP
            || keyCode == KeyEvent.KEYCODE_DPAD_DOWN
            || keyCode == KeyEvent.KEYCODE_DPAD_CENTER
            || keyCode == KeyEvent.KEYCODE_ENTER
            || keyCode == KeyEvent.KEYCODE_BACK
            || keyCode == KeyEvent.KEYCODE_MENU
        ) {
            Log.d(TAG, "onKeyUp keyCode=$keyCode renderMode=$activeRenderMode")
            if (remoteControlHandler.onKey(binding.root, keyCode, event)) {
                return true
            }
        }
        return super.onKeyUp(keyCode, event)
    }

    private fun setupRemoteControl() {
        binding.root.setOnKeyListener(remoteControlHandler)
        binding.root.isFocusable = true
        binding.root.isFocusableInTouchMode = true
        binding.root.requestFocus()
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun setupChapterWebView() {
        binding.chapterWebView.apply {
            setBackgroundColor(Color.TRANSPARENT)
            isFocusable = true
            isFocusableInTouchMode = false
            setOnKeyListener(remoteControlHandler)
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.loadsImagesAutomatically = true
            settings.allowFileAccess = false
            settings.allowContentAccess = false
            isHorizontalScrollBarEnabled = false
            isVerticalScrollBarEnabled = false
            overScrollMode = View.OVER_SCROLL_NEVER
            addJavascriptInterface(ReaderWebBridge(), "ReadBookBridge")
            webViewClient = object : WebViewClient() {
                override fun onPageFinished(view: WebView?, url: String?) {
                    super.onPageFinished(view, url)
                    view?.evaluateJavascript(
                        "(function(){ if (window.__readbookWaitForReady) { window.__readbookWaitForReady(); } })();",
                        null
                    )
                }

                override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                    return true
                }

                override fun shouldInterceptRequest(view: WebView?, request: WebResourceRequest?): WebResourceResponse? {
                    val url = request?.url?.toString() ?: return null
                    if (!url.startsWith(ApiClient.getBaseUrl()) || !url.contains("/storage/parsed/")) {
                        return null
                    }

                    return runCatching {
                        val response = ApiClient.openAuthorizedResource(url)
                        val body = response.body ?: return@runCatching null
                        val contentType = body.contentType()
                        val mimeType = contentType?.type + "/" + contentType?.subtype
                        val encoding = contentType?.charset(Charsets.UTF_8)?.name() ?: "utf-8"
                        WebResourceResponse(
                            mimeType,
                            encoding,
                            body.byteStream()
                        ).apply {
                            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.LOLLIPOP) {
                                setStatusCodeAndReasonPhrase(response.code, response.message.ifBlank { "OK" })
                                response.headers.toMultimap().mapValues { entry -> entry.value.joinToString(",") }
                                    .also { responseHeaders = it }
                            }
                        }
                    }.getOrNull()
                }
            }
        }
    }

    private fun setupMenuButtons() {
        binding.tabSettings.setOnClickListener {
            switchMenuTab(MenuTab.SETTINGS)
        }
        binding.tabBookmarks.setOnClickListener {
            switchMenuTab(MenuTab.BOOKMARKS)
        }
        binding.fontSizeSmall.setOnClickListener {
            preferenceManager.fontSize = FontSize.SMALL
            applyFontSize()
            updateMenuSelection()
            restartMenuAutoHide()
            lifecycleScope.launch { reloadCurrentChapterContent(keepCurrentProgress = true) }
        }
        binding.fontSizeMedium.setOnClickListener {
            preferenceManager.fontSize = FontSize.MEDIUM
            applyFontSize()
            updateMenuSelection()
            restartMenuAutoHide()
            lifecycleScope.launch { reloadCurrentChapterContent(keepCurrentProgress = true) }
        }
        binding.fontSizeLarge.setOnClickListener {
            preferenceManager.fontSize = FontSize.LARGE
            applyFontSize()
            updateMenuSelection()
            restartMenuAutoHide()
            lifecycleScope.launch { reloadCurrentChapterContent(keepCurrentProgress = true) }
        }

        binding.themeYellow.setOnClickListener {
            preferenceManager.theme = Theme.YELLOW
            applyTheme()
            if (currentChapterMeta != null) renderCurrentPage()
            updateMenuSelection()
            restartMenuAutoHide()
        }
        binding.themeWhite.setOnClickListener {
            preferenceManager.theme = Theme.WHITE
            applyTheme()
            if (currentChapterMeta != null) renderCurrentPage()
            updateMenuSelection()
            restartMenuAutoHide()
        }
        binding.themeDark.setOnClickListener {
            preferenceManager.theme = Theme.DARK
            applyTheme()
            if (currentChapterMeta != null) renderCurrentPage()
            updateMenuSelection()
            restartMenuAutoHide()
        }

        binding.brightnessNormal.setOnClickListener {
            preferenceManager.readerBrightness = ReaderBrightness.BRIGHT
            applyBrightness()
            updateMenuSelection()
            restartMenuAutoHide()
        }
        binding.brightnessDim15.setOnClickListener {
            preferenceManager.readerBrightness = ReaderBrightness.DIM_15
            applyBrightness()
            updateMenuSelection()
            restartMenuAutoHide()
        }
        binding.brightnessDim30.setOnClickListener {
            preferenceManager.readerBrightness = ReaderBrightness.DIM_30
            applyBrightness()
            updateMenuSelection()
            restartMenuAutoHide()
        }
        binding.brightnessDim45.setOnClickListener {
            preferenceManager.readerBrightness = ReaderBrightness.DIM_45
            applyBrightness()
            updateMenuSelection()
            restartMenuAutoHide()
        }
    }

    private fun updateMenuSelection() {
        binding.tabSettings.isSelected = activeMenuTab == MenuTab.SETTINGS
        binding.tabBookmarks.isSelected = activeMenuTab == MenuTab.BOOKMARKS
        binding.fontSizeSmall.isSelected = preferenceManager.fontSize == FontSize.SMALL
        binding.fontSizeMedium.isSelected = preferenceManager.fontSize == FontSize.MEDIUM
        binding.fontSizeLarge.isSelected = preferenceManager.fontSize == FontSize.LARGE
        binding.themeYellow.isSelected = preferenceManager.theme == Theme.YELLOW
        binding.themeWhite.isSelected = preferenceManager.theme == Theme.WHITE
        binding.themeDark.isSelected = preferenceManager.theme == Theme.DARK
        binding.brightnessNormal.isSelected = preferenceManager.readerBrightness == ReaderBrightness.BRIGHT
        binding.brightnessDim15.isSelected = preferenceManager.readerBrightness == ReaderBrightness.DIM_15
        binding.brightnessDim30.isSelected = preferenceManager.readerBrightness == ReaderBrightness.DIM_30
        binding.brightnessDim45.isSelected = preferenceManager.readerBrightness == ReaderBrightness.DIM_45
    }

    private fun applyTheme() {
        val theme = preferenceManager.theme
        binding.root.setBackgroundColor(Color.parseColor(theme.backgroundColor))
        binding.contentText.setTextColor(Color.parseColor(theme.textColor))
        binding.pageInfoText.setTextColor(Color.parseColor(theme.secondaryColor))
        binding.titleText.setTextColor(Color.parseColor(theme.secondaryColor))
    }

    private fun applyFontSize() {
        binding.contentText.setTextSize(
            TypedValue.COMPLEX_UNIT_SP,
            preferenceManager.fontSize.dp.toFloat()
        )
    }

    private fun applyBrightness() {
        AppBrightnessController.applyWindowBackground(
            activity = this,
            preferenceManager = preferenceManager,
            theme = preferenceManager.theme
        )
        AppBrightnessController.applyOverlay(binding.brightnessOverlay, preferenceManager)
    }

    private fun startRemainingTimeTicker() {
        remainingBaseTodaySeconds = preferenceManager.todayReadingSeconds
        remainingBaseContinuousSeconds = preferenceManager.continuousReadingSeconds
        remainingBaseDate = preferenceManager.todayDate
        remainingTimerStartedAtMs = SystemClock.elapsedRealtime()
        remainingTimeHandler.removeCallbacks(remainingTimeRunnable)
        refreshRemainingTimeDisplay()
        remainingTimeHandler.postDelayed(remainingTimeRunnable, 1000L)
    }

    private fun refreshRemainingTimeDisplay() {
        syncRemainingTimeBaseIfNeeded()
        val elapsedSeconds = ((SystemClock.elapsedRealtime() - remainingTimerStartedAtMs) / 1000L).coerceAtLeast(0L)
        val remainingSeconds = ReaderAvailableTime.remainingReadableSeconds(
            dailyLimitMinutes = preferenceManager.dailyLimitMinutes,
            todayReadingSeconds = remainingBaseTodaySeconds + elapsedSeconds,
            continuousLimitMinutes = preferenceManager.continuousLimitMinutes,
            continuousReadingSeconds = remainingBaseContinuousSeconds + elapsedSeconds
        )
        binding.remainingTimeText.text = getString(
            com.readbook.tv.R.string.reader_remaining_time,
            LockDurationFormatter.format(remainingSeconds)
        )
    }

    private fun syncRemainingTimeBaseIfNeeded() {
        val storedDate = preferenceManager.todayDate
        val storedTodaySeconds = preferenceManager.todayReadingSeconds
        val storedContinuousSeconds = preferenceManager.continuousReadingSeconds
        val elapsedSeconds = ((SystemClock.elapsedRealtime() - remainingTimerStartedAtMs) / 1000L).coerceAtLeast(0L)
        val displayedTodaySeconds = remainingBaseTodaySeconds + elapsedSeconds
        val shouldResetBase = storedDate != remainingBaseDate ||
            storedTodaySeconds > displayedTodaySeconds ||
            storedTodaySeconds < remainingBaseTodaySeconds ||
            storedContinuousSeconds < remainingBaseContinuousSeconds

        if (!shouldResetBase) return

        remainingBaseDate = storedDate
        remainingBaseTodaySeconds = storedTodaySeconds
        remainingBaseContinuousSeconds = storedContinuousSeconds
        remainingTimerStartedAtMs = SystemClock.elapsedRealtime()
    }

    private suspend fun loadProgress() {
        val progress = bookRepository.getProgress(bookId)
        progress?.let {
            currentPage = it.currentPage
            currentChapter = it.currentChapter
        }
    }

    private fun saveProgress() {
        lifecycleScope.launch {
            bookRepository.updateCurrentPage(bookId, currentPage)
            saveLocalReaderPosition()
        }
    }

    private suspend fun loadCurrentChapterContent() {
        if (chapters.isEmpty()) {
            chapters = withContext(Dispatchers.IO) {
                bookRepository.getChapters(bookId).sortedBy { it.chapterIndex }
            }
        }
        reloadCurrentChapterContent(keepCurrentProgress = false)
    }

    private suspend fun reloadCurrentChapterContent(keepCurrentProgress: Boolean) {
        binding.loadingIndicator.visibility = View.VISIBLE

        val chapterMeta = findChapterByServerPage(currentPage) ?: chapters.firstOrNull()
        if (chapterMeta == null) {
            showLoadError("missing_chapter_meta")
            return
        }

        val chapterWithContent = withContext(Dispatchers.IO) {
            bookRepository.getChapterContent(bookId, chapterMeta.chapterIndex)
        }

        if (chapterWithContent == null) {
            showLoadError("missing_chapter_content")
            return
        }

        val previousChapterIndex = currentChapter
        awaitContentViewport()

        currentChapterMeta = chapterWithContent
        currentChapter = chapterWithContent.chapterIndex

        val htmlDocument = buildHtmlChapterDocument(chapterWithContent)
        if (htmlDocument != null) {
            val htmlPageCount = loadHtmlChapterIntoWebView(htmlDocument)
            if (htmlPageCount > 0) {
                activeRenderMode = ReaderRenderMode.XHTML
                currentHtmlChapter = htmlDocument
                currentHtmlPageCount = htmlPageCount.coerceAtLeast(1)
                currentChapterPages = emptyList()
                binding.nativeContentContainer.visibility = View.GONE
                binding.chapterWebView.visibility = View.VISIBLE
                currentLocalPageIndex = when {
                    keepCurrentProgress && previousChapterIndex == chapterMeta.chapterIndex -> {
                        currentLocalPageIndex.coerceIn(0, currentHtmlPageCount - 1)
                    }
                    restoreLocalReaderPosition(chapterWithContent) -> {
                        currentLocalPageIndex
                    }
                    else -> {
                        mapServerPageToLocalIndex(chapterWithContent, currentPage, currentHtmlPageCount)
                    }
                }

                renderCurrentPage()
                binding.loadingIndicator.visibility = View.GONE
                return
            }
        }

        val pages = buildReaderPages(chapterWithContent)
        if (pages.isEmpty()) {
            showLoadError("empty_local_pages")
            return
        }

        activeRenderMode = ReaderRenderMode.NATIVE
        currentHtmlChapter = null
        currentHtmlPageCount = 0
        currentChapterPages = pages
        binding.chapterWebView.visibility = View.GONE
        binding.nativeContentContainer.visibility = View.VISIBLE
        currentLocalPageIndex = when {
            keepCurrentProgress && previousChapterIndex == chapterMeta.chapterIndex -> {
                currentLocalPageIndex.coerceIn(0, currentChapterPages.lastIndex)
            }
            restoreLocalReaderPosition(chapterWithContent) -> {
                currentLocalPageIndex
            }
            else -> {
                mapServerPageToLocalIndex(chapterWithContent, currentPage, currentChapterPages.size)
            }
        }

        renderCurrentPage()
        binding.loadingIndicator.visibility = View.GONE
    }

    private fun buildHtmlChapterDocument(chapter: Chapter): HtmlChapterDocument? {
        val renderHtml = chapter.renderHtml?.takeIf { it.isNotBlank() } ?: return null
        val renderBaseUrl = chapter.renderBaseUrl?.takeIf { it.isNotBlank() } ?: return null
        val renderCssTexts = ReaderRenderCssJson.decode(chapter.renderCssJson)

        return HtmlChapterDocument(
            baseUrl = renderBaseUrl,
            html = renderHtml,
            cssTexts = renderCssTexts,
        )
    }

    private suspend fun loadHtmlChapterIntoWebView(document: HtmlChapterDocument): Int =
        suspendCancellableCoroutine { continuation ->
            onHtmlLayoutReady = { pageCount ->
                if (continuation.isActive) {
                    continuation.resume(pageCount)
                }
            }

            binding.chapterWebView.post {
                binding.chapterWebView.loadDataWithBaseURL(
                    document.baseUrl,
                    buildPagedHtmlDocument(document),
                    "text/html",
                    "utf-8",
                    null
                )
            }

            continuation.invokeOnCancellation {
                onHtmlLayoutReady = null
            }
        }

    private fun buildPagedHtmlDocument(document: HtmlChapterDocument): String {
        val cssBlock = document.cssTexts.joinToString("\n") { "<style>$it</style>" }
        val pagePaddingHorizontal = 0
        val pagePaddingTop = 0
        val pagePaddingBottom = 0

        return """
            <!DOCTYPE html>
            <html lang="zh-CN">
            <head>
              <meta charset="utf-8" />
              <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no" />
              <style>
                html, body {
                  margin: 0;
                  padding: 0;
                  width: 100%;
                  height: 100%;
                  overflow: hidden;
                  background: transparent;
                }
                body {
                  -webkit-text-size-adjust: none;
                  font-size: 1.08em;
                }
                #page-stage {
                  width: 100vw;
                  height: 100vh;
                  overflow: hidden;
                  padding: 0;
                  box-sizing: border-box;
                  background: transparent;
                }
                #page-shell {
                  width: 100%;
                  height: 100%;
                  position: relative;
                  border-radius: 0;
                  background: transparent;
                  box-shadow: none;
                  overflow: hidden;
                }
                #page-scroll {
                  position: absolute;
                  left: ${pagePaddingHorizontal}px;
                  right: ${pagePaddingHorizontal}px;
                  top: ${pagePaddingTop}px;
                  bottom: ${pagePaddingBottom}px;
                  overflow: hidden;
                }
                #chapter-content {
                  position: relative;
                  width: 100%;
                  height: 100%;
                  padding: 6px 0;
                  column-fill: auto;
                }
                #chapter-content,
                #chapter-content * {
                  box-sizing: border-box;
                }
                #chapter-content img,
                #chapter-content svg,
                #chapter-content video,
                #chapter-content canvas,
                #chapter-content table {
                  max-width: 100%;
                  height: auto;
                }
                #chapter-content img {
                  display: block;
                  margin-left: auto;
                  margin-right: auto;
                  break-inside: avoid;
                  page-break-inside: avoid;
                }
                #chapter-content p,
                #chapter-content h1,
                #chapter-content h2,
                #chapter-content h3,
                #chapter-content h4,
                #chapter-content h5,
                #chapter-content h6,
                #chapter-content div,
                #chapter-content figure,
                #chapter-content ul,
                #chapter-content ol,
                #chapter-content table {
                  break-inside: avoid;
                  page-break-inside: avoid;
                }
                #chapter-content p {
                  padding-left: 30px;
                  padding-right: 30px;
                }
              </style>
              $cssBlock
              <script>
                (function() {
                  let currentViewportWidth = 1;
                  let currentViewportHeight = 1;

                  function waitForImages() {
                    const images = Array.from(document.images || []);
                    if (!images.length) {
                      return Promise.resolve();
                    }
                    return Promise.all(images.map((image) => {
                      if (image.complete) {
                        return Promise.resolve();
                      }
                      return new Promise((resolve) => {
                        image.addEventListener('load', resolve, { once: true });
                        image.addEventListener('error', resolve, { once: true });
                      });
                    }));
                  }

                  function viewportWidth(scroller) {
                    if (!scroller) {
                      return 1;
                    }
                    return Math.max(scroller.getBoundingClientRect().width || scroller.clientWidth || 0, 1);
                  }

                  function viewportHeight(scroller) {
                    if (!scroller) {
                      return 1;
                    }
                    return Math.max(scroller.getBoundingClientRect().height || scroller.clientHeight || 0, 1);
                  }

                  function applyImageScale(content, pageWidth) {
                    const images = Array.from(content.querySelectorAll('img'));
                    const maxPageImageWidth = Math.max(pageWidth * 0.8, 1);
                    images.forEach((img) => {
                      img.style.width = '';
                      img.style.height = '';
                      img.style.maxWidth = '100%';
                    });
                    images.forEach((img) => {
                      const baseWidth = img.getBoundingClientRect().width || img.width || 0;
                      const naturalWidth = img.naturalWidth || 0;
                      const naturalHeight = img.naturalHeight || 0;
                      if (baseWidth > 0) {
                        let targetWidth = Math.max(baseWidth * 0.8, 1);
                        if (naturalWidth > pageWidth) {
                          targetWidth = Math.min(targetWidth, maxPageImageWidth);
                        }
                        if (naturalWidth > 0 && naturalHeight > 0) {
                          const projectedHeight = targetWidth * naturalHeight / naturalWidth;
                          const maxImageHeight = currentViewportHeight * 0.9;
                          if (projectedHeight > maxImageHeight) {
                            targetWidth = maxImageHeight * naturalWidth / naturalHeight;
                          }
                        }
                        img.style.width = targetWidth + 'px';
                        img.style.height = 'auto';
                        img.style.maxWidth = 'none';
                        img.style.maxHeight = (currentViewportHeight * 0.9) + 'px';
                      }
                    });
                  }

                  function layoutContent() {
                    const scroller = document.getElementById('page-scroll');
                    const content = document.getElementById('chapter-content');
                    if (!scroller || !content) {
                      currentViewportWidth = 1;
                      currentViewportHeight = 1;
                      return 1;
                    }

                    currentViewportWidth = viewportWidth(scroller);
                    currentViewportHeight = viewportHeight(scroller);
                    const singlePageWidth = Math.max(currentViewportWidth / 2, 1);
                    const spreadWidth = currentViewportWidth;

                    content.style.width = spreadWidth + 'px';
                    content.style.minWidth = spreadWidth + 'px';
                    content.style.height = currentViewportHeight + 'px';
                    content.style.columnWidth = singlePageWidth + 'px';
                    content.style.columnGap = '0px';
                    applyImageScale(content, singlePageWidth);

                    const spreadCount = Math.max(1, Math.ceil((content.scrollWidth + 1) / spreadWidth));
                    return Number.isFinite(spreadCount) ? spreadCount : 1;
                  }

                  window.__readbookShowPage = function(index, totalSlots) {
                    const scroller = document.getElementById('page-scroll');
                    const pageCount = layoutContent();
                    const slotCount = Math.max(totalSlots || pageCount, 1);
                    const safeIndex = Math.max(0, Math.min(index, slotCount - 1));
                    if (scroller) {
                      scroller.scrollLeft = safeIndex * currentViewportWidth;
                      scroller.scrollTop = 0;
                    }
                    return safeIndex;
                  };

                  window.__readbookWaitForReady = function() {
                    waitForImages()
                      .then(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
                      .then(() => {
                        const pageCount = layoutContent();
                        if (window.ReadBookBridge && window.ReadBookBridge.onLayoutReady) {
                          window.ReadBookBridge.onLayoutReady(String(pageCount));
                        }
                      });
                  };
                  window.addEventListener('resize', function() {
                    layoutContent();
                  });
                })();
              </script>
            </head>
            <body>
              <div id="page-stage">
                <div id="page-shell">
                  <div id="page-scroll">
                    <div id="chapter-content">${document.html}</div>
                  </div>
                </div>
              </div>
            </body>
            </html>
        """.trimIndent()
    }

    private fun buildReaderPages(chapter: Chapter): List<ReaderPage> {
        val layoutBlocks = buildReaderLayoutBlocks(chapter)
        return paginateReaderLayoutBlocks(layoutBlocks)
    }

    private fun buildReaderLayoutBlocks(chapter: Chapter): List<ReaderLayoutBlock> {
        val contentBlocks = ReaderContentBlocksJson.decode(chapter.contentBlocksJson)
        if (contentBlocks.isEmpty()) {
            return listOf(ReaderLayoutBlock.Text(chapter.content.orEmpty()))
        }

        return contentBlocks.mapNotNull { block ->
            when {
                block.type == "image" && !block.assetUrl.isNullOrBlank() -> ReaderLayoutBlock.Image(
                    assetUrl = block.assetUrl,
                    alt = block.alt,
                    width = block.width,
                    height = block.height,
                    widthPercent = block.widthPercent,
                )
                block.type == "text" && !block.text.isNullOrBlank() -> ReaderLayoutBlock.Text(block.text)
                else -> null
            }
        }
    }

    private fun paginateReaderLayoutBlocks(blocks: List<ReaderLayoutBlock>): List<ReaderPage> {
        if (blocks.isEmpty()) {
            return listOf(ReaderPage(elements = listOf(PageElement.Text(""))))
        }

        val availableWidth = (
            binding.contentContainer.width -
                binding.contentContainer.paddingLeft -
                binding.contentContainer.paddingRight
            ).coerceAtLeast(1)
        val availableHeight = (
            binding.contentContainer.height -
                binding.contentContainer.paddingTop -
                binding.contentContainer.paddingBottom
            ).coerceAtLeast(1)
        val verticalSpacing = dpToPx(20)

        val pages = mutableListOf<ReaderPage>()
        var currentElements = mutableListOf<PageElement>()
        var remainingHeight = availableHeight

        fun flushCurrentPage(allowsVerticalScroll: Boolean = false) {
            if (currentElements.isEmpty()) {
                return
            }
            pages.add(ReaderPage(elements = currentElements.toList(), allowsVerticalScroll = allowsVerticalScroll))
            currentElements = mutableListOf()
            remainingHeight = availableHeight
        }

        for (block in blocks) {
            when (block) {
                is ReaderLayoutBlock.Text -> {
                    var remainingText = block.text.trim()
                    while (remainingText.isNotBlank()) {
                        val fit = fitTextIntoHeight(remainingText, availableWidth, remainingHeight)
                        if (fit == null) {
                            if (currentElements.isNotEmpty()) {
                                flushCurrentPage()
                                continue
                            }

                            val forcedPages = paginateWithTextView(remainingText)
                            forcedPages.forEach { pageText ->
                                pages.add(ReaderPage(elements = listOf(PageElement.Text(pageText))))
                            }
                            break
                        }

                        currentElements.add(PageElement.Text(fit.segment))
                        remainingHeight -= fit.usedHeight + verticalSpacing
                        remainingText = fit.rest.trimStart('\n')
                        if (remainingText.isNotBlank()) {
                            flushCurrentPage()
                        }
                    }
                }
                is ReaderLayoutBlock.Image -> {
                    val imageMetrics = computeImageMetrics(block, availableWidth)
                    val element = PageElement.Image(
                        assetUrl = block.assetUrl,
                        alt = block.alt,
                        displayWidthPx = imageMetrics.first,
                        displayHeightPx = imageMetrics.second,
                    )

                    val requiredHeight = imageMetrics.second + if (currentElements.isEmpty()) 0 else verticalSpacing
                    if (requiredHeight <= remainingHeight) {
                        currentElements.add(element)
                        remainingHeight -= requiredHeight
                        continue
                    }

                    if (currentElements.isNotEmpty()) {
                        flushCurrentPage()
                    }

                    val allowsScroll = imageMetrics.second > availableHeight
                    currentElements.add(element)
                    flushCurrentPage(allowsVerticalScroll = allowsScroll)
                }
            }
        }

        flushCurrentPage()
        return pages.ifEmpty { listOf(ReaderPage(elements = listOf(PageElement.Text("")))) }
    }

    private suspend fun awaitContentViewport(): Pair<Int, Int> =
        suspendCancellableCoroutine { continuation ->
            binding.contentContainer.post {
                val width = (
                    binding.contentContainer.width -
                        binding.contentContainer.paddingLeft -
                        binding.contentContainer.paddingRight
                    ).coerceAtLeast(1)
                val height = (
                    binding.contentContainer.height -
                        binding.contentContainer.paddingTop -
                        binding.contentContainer.paddingBottom
                    ).coerceAtLeast(1)
                continuation.resume(
                    Pair(
                        width,
                        height
                    )
                )
            }
        }

    private fun paginateWithTextView(content: String): List<String> {
        val normalizedContent = formatReadingContent(content)

        if (normalizedContent.isBlank()) {
            return listOf("")
        }

        if (binding.contentText.visibility != View.VISIBLE) {
            binding.contentText.visibility = View.VISIBLE
        }

        val availableWidth = (
            binding.contentContainer.width -
                binding.contentContainer.paddingLeft -
                binding.contentContainer.paddingRight
            ).coerceAtLeast(1)
        val availableHeight = (
            binding.contentContainer.height -
                binding.contentContainer.paddingTop -
                binding.contentContainer.paddingBottom
            ).coerceAtLeast(1)

        val widthSpec = MeasureSpec.makeMeasureSpec(availableWidth, MeasureSpec.EXACTLY)
        val heightSpec = MeasureSpec.makeMeasureSpec(0, MeasureSpec.UNSPECIFIED)
        val pages = mutableListOf<String>()
        var start = 0

        while (start < normalizedContent.length) {
            var low = start + 1
            var high = normalizedContent.length
            var best = start

            while (low <= high) {
                val mid = (low + high) ushr 1
                binding.contentText.text = normalizedContent.substring(start, mid)
                binding.contentText.measure(widthSpec, heightSpec)

                if (binding.contentText.measuredHeight <= availableHeight) {
                    best = mid
                    low = mid + 1
                } else {
                    high = mid - 1
                }
            }

            if (best <= start) {
                best = minOf(start + 1, normalizedContent.length)
            }

            val adjustedEnd = adjustMeasuredBreakPoint(normalizedContent, start, best)
            val pageText = normalizedContent.substring(start, adjustedEnd).trimEnd('\n')
            if (pageText.isNotBlank()) {
                pages.add(pageText)
            }

            start = adjustedEnd
            while (start < normalizedContent.length && normalizedContent[start] == '\n') {
                start++
            }
        }

        return pages.ifEmpty { listOf(normalizedContent) }
    }

    private data class FittedTextSegment(
        val segment: String,
        val rest: String,
        val usedHeight: Int,
    )

    private fun fitTextIntoHeight(content: String, availableWidth: Int, availableHeight: Int): FittedTextSegment? {
        val normalizedContent = formatReadingContent(content)
        if (normalizedContent.isBlank() || availableHeight <= dpToPx(40)) {
            return null
        }

        val widthSpec = MeasureSpec.makeMeasureSpec(availableWidth, MeasureSpec.EXACTLY)
        val heightSpec = MeasureSpec.makeMeasureSpec(0, MeasureSpec.UNSPECIFIED)
        var start = 0
        var low = 1
        var high = normalizedContent.length
        var best = 0

        while (low <= high) {
            val mid = (low + high) ushr 1
            binding.contentText.text = normalizedContent.substring(start, mid)
            binding.contentText.measure(widthSpec, heightSpec)

            if (binding.contentText.measuredHeight <= availableHeight) {
                best = mid
                low = mid + 1
            } else {
                high = mid - 1
            }
        }

        if (best <= start) {
            return null
        }

        val adjustedEnd = adjustMeasuredBreakPoint(normalizedContent, start, best)
            .coerceAtLeast(start + 1)
        val segment = normalizedContent.substring(start, adjustedEnd).trimEnd('\n')
        binding.contentText.text = segment
        binding.contentText.measure(widthSpec, heightSpec)

        return FittedTextSegment(
            segment = segment,
            rest = normalizedContent.substring(adjustedEnd),
            usedHeight = binding.contentText.measuredHeight,
        )
    }

    private fun computeImageMetrics(block: ReaderLayoutBlock.Image, availableWidth: Int): Pair<Int, Int> {
        val widthPercent = (block.widthPercent ?: 95f).coerceIn(20f, 100f)
        val displayWidth = (availableWidth * (widthPercent / 100f)).roundToInt().coerceAtLeast(dpToPx(120))
        val displayHeight = when {
            block.width != null && block.height != null && block.width > 0 && block.height > 0 -> {
                (displayWidth.toFloat() * block.height.toFloat() / block.width.toFloat()).roundToInt()
            }
            else -> (displayWidth * 0.68f).roundToInt()
        }.coerceAtLeast(dpToPx(80))

        return displayWidth to displayHeight
    }

    private fun dpToPx(value: Int): Int =
        TypedValue.applyDimension(
            TypedValue.COMPLEX_UNIT_DIP,
            value.toFloat(),
            resources.displayMetrics
        ).roundToInt()

    private fun formatReadingContent(content: String): String {
        return content
            .replace("\r\n", "\n")
            .replace(Regex("[\\t\\x0B\\f]+"), " ")
            .replace(Regex("[ ]+\n"), "\n")
            .replace(Regex("\n[ ]+"), "\n")
            .replace(Regex("\n{2,}"), "\n")
            .lines()
            .joinToString("\n") { line ->
                val trimmed = line.trim()
                when {
                    trimmed.isEmpty() -> ""
                    shouldIndentParagraph(trimmed) -> "\u3000\u3000$trimmed"
                    else -> trimmed
                }
            }
            .trim()
    }

    private fun shouldIndentParagraph(line: String): Boolean {
        if (line.length <= 12) {
            return false
        }
        if (!line.contains(Regex("[，。！？；：“”‘’、,\\.!?;:]"))) {
            return false
        }
        return true
    }

    private fun adjustMeasuredBreakPoint(text: String, start: Int, fittedEnd: Int): Int =
        ReaderPageBreaks.adjustBreakPoint(text, start, fittedEnd)

    private fun currentLocalPageCount(): Int =
        when (activeRenderMode) {
            ReaderRenderMode.NATIVE -> currentChapterPages.size.coerceAtLeast(1)
            ReaderRenderMode.XHTML -> currentHtmlPageCount.coerceAtLeast(1)
        }

    private fun renderCurrentPage() {
        val chapterMeta = currentChapterMeta
        if (chapterMeta == null) {
            showLoadError("render_slice_missing")
            return
        }

        val localPageCount = currentLocalPageCount()
        currentPage = mapLocalIndexToServerPage(chapterMeta, currentLocalPageIndex, localPageCount)

        when (activeRenderMode) {
            ReaderRenderMode.NATIVE -> {
                val content = currentChapterPages.getOrNull(currentLocalPageIndex)
                if (content == null) {
                    showLoadError("render_native_page_missing")
                    return
                }
                pageContent = content.previewText().orEmpty()
                showNativeContent(content)
                binding.nativeContentContainer.scrollTo(0, 0)
            }
            ReaderRenderMode.XHTML -> {
                if (currentHtmlChapter == null) {
                    showLoadError("render_html_page_missing")
                    return
                }
                pageContent = buildApproximatePagePreview(chapterMeta, currentLocalPageIndex, localPageCount)
                showHtmlContent(currentLocalPageIndex)
            }
        }

        updatePageInfo()
        updateBookmarkIndicator()
        saveProgress()
        SyncService.updateCurrentPage(this@ReaderActivity, currentPage)
    }

    private fun showNativeContent(content: ReaderPage) {
        binding.contentText.visibility = View.GONE
        binding.pageContentStack.removeAllViews()
        val theme = preferenceManager.theme

        content.elements.forEach { element ->
            when (element) {
                is PageElement.Text -> {
                    val textView = TextView(this).apply {
                        layoutParams = LinearLayout.LayoutParams(
                            ViewGroup.LayoutParams.MATCH_PARENT,
                            ViewGroup.LayoutParams.WRAP_CONTENT
                        ).also { params ->
                            params.bottomMargin = dpToPx(20)
                        }
                        includeFontPadding = false
                        setLineSpacing(0f, 1.38f)
                        setTextColor(Color.parseColor(theme.textColor))
                        setTextSize(TypedValue.COMPLEX_UNIT_SP, preferenceManager.fontSize.dp.toFloat())
                        text = element.text
                    }
                    binding.pageContentStack.addView(textView)
                }
                is PageElement.Image -> {
                    val imageView = ImageView(this).apply {
                        layoutParams = LinearLayout.LayoutParams(
                            element.displayWidthPx,
                            element.displayHeightPx
                        ).also { params ->
                            params.gravity = Gravity.CENTER_HORIZONTAL
                            params.bottomMargin = dpToPx(20)
                        }
                        adjustViewBounds = true
                        scaleType = ImageView.ScaleType.FIT_CENTER
                        contentDescription = element.alt ?: "章节插图"
                    }
                    Glide.with(imageView)
                        .load(buildAuthorizedImageModel(element.assetUrl))
                        .fitCenter()
                        .into(imageView)
                    binding.pageContentStack.addView(imageView)
                }
            }
        }
    }

    private fun showHtmlContent(pageIndex: Int) {
        binding.nativeContentContainer.visibility = View.GONE
        binding.chapterWebView.visibility = View.VISIBLE
        binding.chapterWebView.evaluateJavascript(
            "(function(){ return window.__readbookShowPage ? window.__readbookShowPage(${pageIndex.coerceAtLeast(0)}, ${currentHtmlPageCount.coerceAtLeast(1)}) : 0; })();",
            null
        )
    }

    private fun buildApproximatePagePreview(chapter: Chapter, pageIndex: Int, pageCount: Int): String {
        val normalized = formatReadingContent(chapter.content.orEmpty())
        if (normalized.isBlank()) {
            return chapter.title.orEmpty()
        }

        val safePageCount = pageCount.coerceAtLeast(1)
        val start = ((normalized.length.toDouble() * pageIndex.toDouble()) / safePageCount.toDouble()).toInt()
            .coerceIn(0, normalized.length - 1)
        val end = ((normalized.length.toDouble() * (pageIndex + 1).toDouble()) / safePageCount.toDouble()).toInt()
            .coerceIn(start + 1, normalized.length)

        return normalized.substring(start, end).trim().ifBlank {
            normalized.take(80)
        }
    }

    private fun updatePageInfo() {
        binding.pageInfoText.text = "$currentPage/$totalPages"
        binding.progressBar.max = totalPages
        binding.progressBar.progress = currentPage.coerceIn(1, totalPages)
    }

    private fun buildAuthorizedImageModel(assetUrl: String): Any {
        val token = ApiClient.getDeviceToken()
        if (token.isNullOrBlank()) {
            return assetUrl
        }
        return GlideUrl(
            assetUrl,
            LazyHeaders.Builder()
                .addHeader("Authorization", "Bearer $token")
                .build()
        )
    }

    private fun scrollImagePage(direction: Int): Boolean {
        if (activeRenderMode != ReaderRenderMode.NATIVE) {
            return false
        }
        val currentReaderPage = currentChapterPages.getOrNull(currentLocalPageIndex) ?: return false
        if (!currentReaderPage.allowsVerticalScroll) {
            return false
        }

        val viewportHeight = binding.nativeContentContainer.height
        val contentHeight = binding.pageContentHost.height
        val maxScroll = (contentHeight - viewportHeight).coerceAtLeast(0)
        if (maxScroll <= 0) {
            return false
        }

        val currentScroll = binding.nativeContentContainer.scrollY
        val scrollStep = (viewportHeight * 0.78f).roundToInt().coerceAtLeast(1)
        val targetScroll = if (direction > 0) {
            (currentScroll + scrollStep).coerceAtMost(maxScroll)
        } else {
            (currentScroll - scrollStep).coerceAtLeast(0)
        }

        if (targetScroll == currentScroll) {
            return false
        }

        binding.nativeContentContainer.smoothScrollTo(0, targetScroll)
        return true
    }

    private fun nextPage() {
        Log.d(TAG, "nextPage renderMode=$activeRenderMode localPage=$currentLocalPageIndex localCount=${currentLocalPageCount()} currentPage=$currentPage")
        if (currentLocalPageIndex < currentLocalPageCount() - 1) {
            currentLocalPageIndex++
            renderCurrentPage()
            return
        }

        val nextChapter = chapters.firstOrNull { it.chapterIndex > currentChapter }
        if (nextChapter != null) {
            currentPage = nextChapter.startPage
            currentLocalPageIndex = 0
            lifecycleScope.launch { reloadCurrentChapterContent(keepCurrentProgress = false) }
        }
    }

    private fun previousPage() {
        Log.d(TAG, "previousPage renderMode=$activeRenderMode localPage=$currentLocalPageIndex currentPage=$currentPage")
        if (currentLocalPageIndex > 0) {
            currentLocalPageIndex--
            renderCurrentPage()
            return
        }

        val previousChapter = chapters.lastOrNull { it.chapterIndex < currentChapter }
        if (previousChapter != null) {
            currentPage = previousChapter.endPage
            lifecycleScope.launch { reloadCurrentChapterContent(keepCurrentProgress = false) }
        }
    }

    fun goToPage(page: Int) {
        val targetPage = page.coerceIn(1, totalPages)
        if (targetPage == currentPage && currentChapterMeta != null) {
            return
        }
        currentPage = targetPage
        lifecycleScope.launch { reloadCurrentChapterContent(keepCurrentProgress = false) }
    }

    private fun toggleMenu() {
        if (isMenuVisible) hideMenu() else showMenu()
    }

    private fun showMenu() {
        isMenuVisible = true
        activeMenuTab = MenuTab.SETTINGS
        switchMenuTab(activeMenuTab, requestFocus = false)
        updateMenuSelection()
        binding.menuPanel.visibility = View.VISIBLE
        binding.tabSettings.requestFocus()
        restartMenuAutoHide()
    }

    private fun hideMenu() {
        isMenuVisible = false
        binding.menuPanel.visibility = View.GONE
        menuHandler.removeCallbacks(menuHideRunnable)
        binding.root.requestFocus()
    }

    private fun loadBookmarks() {
        lifecycleScope.launch {
            bookRepository.getBookmarks(bookId).collect { bookmarkList ->
                bookmarks = bookmarkList
                updateBookmarkIndicator()
                renderBookmarksMenu()
            }
        }
    }

    private fun updateBookmarkIndicator() {
        val hasBookmark = bookmarks.any { it.pageNumber == currentPage }
        binding.bookmarkIndicator.visibility = if (hasBookmark) View.VISIBLE else View.INVISIBLE
    }

    private fun addBookmark() {
        lifecycleScope.launch {
            val hasBookmark = bookRepository.hasBookmark(bookId, currentPage)
            if (hasBookmark) {
                Toast.makeText(this@ReaderActivity, getString(com.readbook.tv.R.string.bookmark_exists), Toast.LENGTH_SHORT).show()
            } else {
                val preview = RestAutoBookmark.buildPreview(pageContent)
                bookRepository.addBookmark(bookId, currentPage, preview)
                Toast.makeText(this@ReaderActivity, getString(com.readbook.tv.R.string.bookmark_added), Toast.LENGTH_SHORT).show()
            }
        }
    }

    private fun switchMenuTab(tab: MenuTab, requestFocus: Boolean = true) {
        activeMenuTab = tab
        binding.settingsPanel.visibility = if (tab == MenuTab.SETTINGS) View.VISIBLE else View.GONE
        binding.bookmarksPanel.visibility = if (tab == MenuTab.BOOKMARKS) View.VISIBLE else View.GONE
        updateMenuSelection()
        restartMenuAutoHide()

        if (tab == MenuTab.BOOKMARKS) {
            renderBookmarksMenu()
            if (requestFocus) {
                focusBookmarkContent()
            }
        } else if (requestFocus) {
            binding.fontSizeMedium.requestFocus()
        }
    }

    private fun renderBookmarksMenu() {
        if (!::binding.isInitialized) return

        binding.bookmarksList.removeAllViews()
        binding.emptyBookmarksText.visibility = if (bookmarks.isEmpty()) View.VISIBLE else View.GONE

        bookmarks.forEach { bookmark ->
            val itemBinding = ItemReaderBookmarkBinding.inflate(
                LayoutInflater.from(this),
                binding.bookmarksList,
                false
            )
            itemBinding.bookmarkJump.text = getString(
                com.readbook.tv.R.string.bookmark_page_label,
                bookmark.pageNumber,
                bookmark.previewText.orEmpty()
            )
            itemBinding.bookmarkJump.setOnClickListener {
                jumpToBookmark(bookmark)
            }
            itemBinding.bookmarkDelete.setOnClickListener {
                lifecycleScope.launch {
                    bookRepository.deleteBookmark(bookmark)
                }
                restartMenuAutoHide()
            }
            binding.bookmarksList.addView(itemBinding.root)
        }
    }

    private fun focusBookmarkContent() {
        val firstJumpButton = binding.bookmarksList.getChildAt(0)?.findViewById<View>(com.readbook.tv.R.id.bookmarkJump)
        (firstJumpButton ?: binding.tabBookmarks).requestFocus()
    }

    private fun jumpToBookmark(bookmark: Bookmark) {
        hideMenu()
        goToPage(bookmark.pageNumber)
    }

    private fun restartMenuAutoHide() {
        if (!isMenuVisible) return
        menuHandler.removeCallbacks(menuHideRunnable)
        menuHandler.postDelayed(menuHideRunnable, 5000)
    }

    private fun findChapterByServerPage(page: Int): Chapter? =
        chapters.firstOrNull { page in it.startPage..it.endPage }

    private fun mapServerPageToLocalIndex(chapter: Chapter, serverPage: Int, localPageCount: Int): Int {
        if (localPageCount <= 1) return 0
        val serverOffset = (serverPage - chapter.startPage).coerceIn(0, chapter.pageCount - 1)
        val ratio = if (chapter.pageCount <= 1) 0f else {
            serverOffset.toFloat() / (chapter.pageCount - 1).toFloat()
        }
        return (ratio * (localPageCount - 1)).roundToInt().coerceIn(0, localPageCount - 1)
    }

    private fun mapLocalIndexToServerPage(chapter: Chapter, localIndex: Int, localPageCount: Int): Int {
        if (localPageCount <= 1 || chapter.pageCount <= 1) return chapter.startPage
        val ratio = localIndex.toFloat() / (localPageCount - 1).toFloat()
        val serverOffset = (ratio * (chapter.pageCount - 1)).roundToInt()
        return (chapter.startPage + serverOffset).coerceIn(chapter.startPage, chapter.endPage)
    }

    private suspend fun saveLocalReaderPosition() {
        val chapterMeta = currentChapterMeta ?: return
        getSharedPreferences(PREFS_READER_POSITION, MODE_PRIVATE)
            .edit()
            .putInt("book_${bookId}_server_page", currentPage)
            .putInt("book_${bookId}_chapter", chapterMeta.chapterIndex)
            .putInt("book_${bookId}_local_page", currentLocalPageIndex)
            .apply()
    }

    private fun restoreLocalReaderPosition(chapter: Chapter): Boolean {
        val preferences = getSharedPreferences(PREFS_READER_POSITION, MODE_PRIVATE)
        val savedServerPage = preferences.getInt("book_${bookId}_server_page", -1)
        val savedChapter = preferences.getInt("book_${bookId}_chapter", -1)
        val savedLocalPage = preferences.getInt("book_${bookId}_local_page", -1)
        if (savedServerPage != currentPage || savedChapter != chapter.chapterIndex || savedLocalPage < 0) {
            return false
        }
        currentLocalPageIndex = savedLocalPage.coerceIn(0, currentLocalPageCount() - 1)
        return true
    }

    private fun showLoadError(reason: String) {
        Log.e(TAG, "load failed: $reason, bookId=$bookId, serverPage=$currentPage, chapter=$currentChapter")
        binding.chapterWebView.visibility = View.GONE
        binding.nativeContentContainer.visibility = View.VISIBLE
        binding.pageContentStack.removeAllViews()
        val errorView = TextView(this).apply {
            layoutParams = LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
            )
            includeFontPadding = false
            setLineSpacing(0f, 1.38f)
            setTextColor(Color.parseColor(preferenceManager.theme.textColor))
            setTextSize(TypedValue.COMPLEX_UNIT_SP, preferenceManager.fontSize.dp.toFloat())
            text = "加载内容失败"
        }
        binding.pageContentStack.addView(errorView)
        binding.contentText.visibility = View.GONE
        binding.loadingIndicator.visibility = View.GONE
    }

    private fun ensureReadingAllowedOrExit(): Boolean {
        return if (ReadingGateGuards.canEnterReader(readingControlCoordinator.currentState())) {
            true
        } else {
            closeReadingAndShowLock(readingControlCoordinator.currentState())
            false
        }
    }

    private fun closeReadingAndShowLock(state: ReadingGateState) {
        if (isNavigatingToLock || isFinishing) return
        if (ReadingGateGuards.canEnterReader(state)) return

        isNavigatingToLock = true
        lifecycleScope.launch {
            if (RestAutoBookmark.shouldCreateFor(state) && hasLoadedProgressState) {
                runCatching {
                    withContext(Dispatchers.IO) {
                        bookRepository.addBookmarkLocal(
                            bookId = bookId,
                            pageNumber = currentPage,
                            previewText = RestAutoBookmark.buildPreview(pageContent)
                        )
                    }
                }.onFailure { error ->
                    Log.w(TAG, "自动添加休息书签失败: ${error.message}")
                }
            }

            SyncService.endSession(this@ReaderActivity)
            AntiAddictionService.stopTimer(this@ReaderActivity)
            startActivity(Intent(this@ReaderActivity, LockActivity::class.java))
            finish()
        }
    }

    override fun onNavigate(direction: com.readbook.tv.util.Direction): Boolean {
        Log.d(TAG, "onNavigate direction=$direction renderMode=$activeRenderMode localPage=$currentLocalPageIndex")
        if (isMenuVisible) return false
        return when (direction) {
            com.readbook.tv.util.Direction.UP -> {
                val currentReaderPage = if (activeRenderMode == ReaderRenderMode.NATIVE) {
                    currentChapterPages.getOrNull(currentLocalPageIndex)
                } else {
                    null
                }
                if (currentReaderPage?.allowsVerticalScroll == true) {
                    if (scrollImagePage(direction = -1)) {
                        true
                    } else {
                        previousPage()
                        true
                    }
                } else {
                    false
                }
            }
            com.readbook.tv.util.Direction.DOWN -> {
                val currentReaderPage = if (activeRenderMode == ReaderRenderMode.NATIVE) {
                    currentChapterPages.getOrNull(currentLocalPageIndex)
                } else {
                    null
                }
                if (currentReaderPage?.allowsVerticalScroll == true) {
                    if (scrollImagePage(direction = 1)) {
                        true
                    } else {
                        nextPage()
                        true
                    }
                } else {
                    false
                }
            }
            com.readbook.tv.util.Direction.LEFT -> {
                previousPage()
                true
            }
            com.readbook.tv.util.Direction.RIGHT -> {
                nextPage()
                true
            }
        }
    }

    override fun onConfirm(): Boolean = true

    override fun onLongPress(): Boolean {
        addBookmark()
        return true
    }

    override fun onBack(): Boolean {
        if (isMenuVisible) {
            hideMenu()
            return true
        }
        finish()
        return true
    }

    override fun onMenu(): Boolean {
        toggleMenu()
        return true
    }

    override fun onFastPageChange(direction: com.readbook.tv.util.PageDirection): Boolean {
        when (direction) {
            com.readbook.tv.util.PageDirection.NEXT -> goToPage(currentPage + 10)
            com.readbook.tv.util.PageDirection.PREVIOUS -> goToPage(currentPage - 10)
        }
        return true
    }
}
