package com.readbook.tv.ui.shelf

import android.content.Intent
import android.os.Bundle
import android.os.SystemClock
import android.util.Log
import android.view.View
import android.view.ViewGroup
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.activity.addCallback
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import androidx.recyclerview.widget.GridLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.readbook.tv.R
import com.readbook.tv.ReadBookApp
import com.readbook.tv.data.model.Book
import com.readbook.tv.data.repository.SyncRepository
import com.readbook.tv.databinding.ActivityShelfBinding
import com.readbook.tv.service.ReadingGateGuards
import com.readbook.tv.service.SyncService
import com.readbook.tv.ui.lock.LockActivity
import com.readbook.tv.ui.reader.ReaderActivity
import com.readbook.tv.util.AppBrightnessController
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch

/**
 * 书架页面
 * 显示已授权的书籍列表
 */
class ShelfActivity : AppCompatActivity(), BookAdapter.OnBookClickListener {
    companion object {
        private const val TAG = "ShelfActivity"
    }

    private lateinit var binding: ActivityShelfBinding
    private lateinit var bookAdapter: BookAdapter
    private lateinit var bookRepository: com.readbook.tv.data.repository.BookRepository
    private lateinit var syncRepository: SyncRepository
    private lateinit var preferenceManager: com.readbook.tv.util.PreferenceManager
    private var booksJob: Job? = null
    private var lastBackPressedAtMs = 0L
    private var exitToast: Toast? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val app = application as ReadBookApp
        AppBrightnessController.applyWindowBackground(
            activity = this,
            preferenceManager = app.preferenceManager,
            baseColorRes = R.color.theme_yellow_background
        )
        binding = ActivityShelfBinding.inflate(layoutInflater)
        setContentView(binding.root)
        bookRepository = app.bookRepository
        syncRepository = app.syncRepository
        preferenceManager = app.preferenceManager

        // 设置标题
        binding.titleText.text = "${preferenceManager.boundChildName ?: "我的"}书架"
        applyBrightness()

        // 初始化列表
        setupRecyclerView()

        // 使用 repeatOnLifecycle 收集 Flow，避免重复收集
        lifecycleScope.launch {
            repeatOnLifecycle(Lifecycle.State.RESUMED) {
                bookRepository.getShelfBooks().collect { books ->
                    Log.i(TAG, "book flow emitted ${books.size} books")
                    if (books.isNotEmpty()) {
                        bookAdapter.submitList(books)
                        focusInitialBook()
                        binding.bookRecyclerView.visibility = View.VISIBLE
                        binding.emptyView.visibility = View.GONE
                    } else {
                        binding.bookRecyclerView.visibility = View.INVISIBLE
                        binding.emptyView.visibility = View.VISIBLE
                    }
                }
            }
        }

        // 开始同步
        SyncService.startSync(this)

        onBackPressedDispatcher.addCallback(this) {
            handleExitBackPress()
        }
    }

    /**
     * 初始化 RecyclerView
     */
    private fun setupRecyclerView() {
        bookAdapter = BookAdapter(this)
        val spanCount = if (resources.displayMetrics.widthPixels >= 1800) 4 else 3
        binding.bookRecyclerView.apply {
            layoutManager = GridLayoutManager(this@ShelfActivity, spanCount)
            adapter = bookAdapter
            setHasFixedSize(true)
            descendantFocusability = ViewGroup.FOCUS_AFTER_DESCENDANTS
            isFocusable = false
            isFocusableInTouchMode = false
            if (itemDecorationCount == 0) {
                addItemDecoration(ShelfSpacingDecoration(horizontal = 12, vertical = 18))
            }
        }
    }

    private fun focusInitialBook() {
        binding.bookRecyclerView.post {
            val focusedChild = binding.bookRecyclerView.findFocus()
            if (focusedChild != null) {
                return@post
            }

            val firstHolder = binding.bookRecyclerView.findViewHolderForAdapterPosition(0)
            if (firstHolder?.itemView?.requestFocus() == true) {
                return@post
            }

            binding.bookRecyclerView.scrollToPosition(0)
            binding.bookRecyclerView.post {
                binding.bookRecyclerView.findViewHolderForAdapterPosition(0)?.itemView?.requestFocus()
            }
        }
    }

    private fun applyBrightness() {
        AppBrightnessController.applyWindowBackground(
            activity = this,
            preferenceManager = preferenceManager,
            baseColorRes = R.color.theme_yellow_background
        )
        AppBrightnessController.applyOverlay(binding.brightnessOverlay, preferenceManager)
    }

    /**
     * 加载书籍
     */
    private fun loadBooks() {
        booksJob?.cancel()
        booksJob = lifecycleScope.launch {
            // 先从本地加载
            bookRepository.getShelfBooks().collect { books ->
                if (books.isNotEmpty()) {
                    bookAdapter.submitList(books)
                    binding.emptyView.visibility = View.GONE
                } else {
                    binding.emptyView.visibility = View.VISIBLE
                }
            }
        }

        // 同步服务器数据
        lifecycleScope.launch {
            val result = syncRepository.sync()
            if (result.isFailure) {
                Log.w(TAG, "sync failed on resume", result.exceptionOrNull())
                runOnUiThread {
                    Toast.makeText(
                        this@ShelfActivity,
                        "同步失败: ${result.exceptionOrNull()?.message}",
                        Toast.LENGTH_SHORT
                    ).show()
                }
            }
        }
    }

    /**
     * 书籍点击回调
     */
    override fun onBookClick(book: Book) {
        openBook(book)
    }

    /**
     * 打开书籍
     */
    private fun openBook(book: Book) {
        val app = application as ReadBookApp
        if (!ReadingGateGuards.canEnterReader(app.readingControlCoordinator.currentState())) {
            startActivity(Intent(this, LockActivity::class.java))
            return
        }

        val intent = Intent(this, ReaderActivity::class.java).apply {
            putExtra(ReaderActivity.EXTRA_BOOK_ID, book.id)
            putExtra(ReaderActivity.EXTRA_BOOK_TITLE, book.title)
            putExtra(ReaderActivity.EXTRA_TOTAL_PAGES, book.totalPages)
        }
        startActivity(intent)
    }

    private fun handleExitBackPress(nowMs: Long = SystemClock.elapsedRealtime()) {
        if (ShelfExitGuard.shouldExit(lastBackPressedAtMs, nowMs)) {
            exitToast?.cancel()
            finishAffinity()
            return
        }

        lastBackPressedAtMs = nowMs
        exitToast?.cancel()
        exitToast = Toast.makeText(this, getString(R.string.shelf_exit_hint), Toast.LENGTH_SHORT)
        exitToast?.show()
    }

    override fun onPause() {
        booksJob?.cancel()
        booksJob = null
        exitToast?.cancel()
        super.onPause()
    }

    override fun onResume() {
        super.onResume()
        (application as ReadBookApp).refreshReadingStateForToday()
        applyBrightness()
        // 同步服务器数据
        lifecycleScope.launch {
            val result = syncRepository.sync()
            if (result.isFailure) {
                runOnUiThread {
                    Toast.makeText(
                        this@ShelfActivity,
                        "同步失败: ${result.exceptionOrNull()?.message}",
                        Toast.LENGTH_SHORT
                    ).show()
                }
            } else {
                Log.i(TAG, "sync completed on resume")
            }
        }
    }

    private class ShelfSpacingDecoration(
        private val horizontal: Int,
        private val vertical: Int
    ) : RecyclerView.ItemDecoration() {
        override fun getItemOffsets(
            outRect: android.graphics.Rect,
            view: View,
            parent: RecyclerView,
            state: RecyclerView.State
        ) {
            outRect.left = horizontal
            outRect.right = horizontal
            outRect.top = vertical / 2
            outRect.bottom = vertical / 2
        }
    }
}
