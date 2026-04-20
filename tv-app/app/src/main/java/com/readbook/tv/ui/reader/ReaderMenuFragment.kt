package com.readbook.tv.ui.reader

import android.graphics.Color
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.fragment.app.DialogFragment
import androidx.lifecycle.lifecycleScope
import com.readbook.tv.R
import com.readbook.tv.ReadBookApp
import com.readbook.tv.data.model.Chapter
import com.readbook.tv.databinding.FragmentReaderMenuBinding
import com.readbook.tv.util.FontSize
import com.readbook.tv.util.PreferenceManager
import com.readbook.tv.util.Theme
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch

/**
 * 阅读器菜单 Fragment
 * 提供设置、书签、目录功能
 */
class ReaderMenuFragment : DialogFragment() {

    private var _binding: FragmentReaderMenuBinding? = null
    private val binding get() = _binding!!

    private lateinit var preferenceManager: PreferenceManager
    private lateinit var bookRepository: com.readbook.tv.data.repository.BookRepository

    private var bookId: Long = 0
    private var currentPage: Int = 1
    private var totalPages: Int = 1

    private var menuListener: MenuListener? = null
    private var bookmarksJob: Job? = null

    interface MenuListener {
        fun onFontSizeChanged(fontSize: FontSize)
        fun onThemeChanged(theme: Theme)
        fun onGoToPage(page: Int)
        fun onGoToChapter(chapterIndex: Int)
        fun onMenuDismiss()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setStyle(STYLE_NO_FRAME, R.style.ReaderMenuStyle)

        arguments?.let {
            bookId = it.getLong(ARG_BOOK_ID, 0)
            currentPage = it.getInt(ARG_CURRENT_PAGE, 1)
            totalPages = it.getInt(ARG_TOTAL_PAGES, 1)
        }
    }

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        _binding = FragmentReaderMenuBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        val app = requireActivity().application as ReadBookApp
        preferenceManager = app.preferenceManager
        bookRepository = app.bookRepository

        setupFontSizeButtons()
        setupThemeButtons()
        setupTabs()
    }

    /**
     * 设置字号按钮
     */
    private fun setupFontSizeButtons() {
        val currentFontSize = preferenceManager.fontSize
        val allowedFontSizes = preferenceManager.allowedFontSizes

        updateFontSizeButtons(currentFontSize)

        binding.fontSizeSmall.setOnClickListener {
            if (allowedFontSizes.contains("small")) {
                preferenceManager.fontSize = FontSize.SMALL
                updateFontSizeButtons(FontSize.SMALL)
                menuListener?.onFontSizeChanged(FontSize.SMALL)
            }
        }

        binding.fontSizeMedium.setOnClickListener {
            if (allowedFontSizes.contains("medium")) {
                preferenceManager.fontSize = FontSize.MEDIUM
                updateFontSizeButtons(FontSize.MEDIUM)
                menuListener?.onFontSizeChanged(FontSize.MEDIUM)
            }
        }

        binding.fontSizeLarge.setOnClickListener {
            if (allowedFontSizes.contains("large")) {
                preferenceManager.fontSize = FontSize.LARGE
                updateFontSizeButtons(FontSize.LARGE)
                menuListener?.onFontSizeChanged(FontSize.LARGE)
            }
        }
    }

    private fun updateFontSizeButtons(selected: FontSize) {
        binding.fontSizeSmall.isSelected = selected == FontSize.SMALL
        binding.fontSizeMedium.isSelected = selected == FontSize.MEDIUM
        binding.fontSizeLarge.isSelected = selected == FontSize.LARGE
    }

    /**
     * 设置主题按钮
     */
    private fun setupThemeButtons() {
        val currentTheme = preferenceManager.theme
        val allowedThemes = preferenceManager.allowedThemes

        updateThemeButtons(currentTheme)

        binding.themeYellow.setOnClickListener {
            if (allowedThemes.contains("yellow")) {
                preferenceManager.theme = Theme.YELLOW
                updateThemeButtons(Theme.YELLOW)
                menuListener?.onThemeChanged(Theme.YELLOW)
            }
        }

        binding.themeWhite.setOnClickListener {
            if (allowedThemes.contains("white")) {
                preferenceManager.theme = Theme.WHITE
                updateThemeButtons(Theme.WHITE)
                menuListener?.onThemeChanged(Theme.WHITE)
            }
        }

        binding.themeDark.setOnClickListener {
            if (allowedThemes.contains("dark")) {
                preferenceManager.theme = Theme.DARK
                updateThemeButtons(Theme.DARK)
                menuListener?.onThemeChanged(Theme.DARK)
            }
        }
    }

    private fun updateThemeButtons(selected: Theme) {
        binding.themeYellow.isSelected = selected == Theme.YELLOW
        binding.themeWhite.isSelected = selected == Theme.WHITE
        binding.themeDark.isSelected = selected == Theme.DARK
    }

    /**
     * 设置标签页
     */
    private fun setupTabs() {
        binding.tabSettings.setOnClickListener {
            showTab(TAB_SETTINGS)
        }

        binding.tabBookmarks.setOnClickListener {
            showTab(TAB_BOOKMARKS)
        }

        binding.tabChapters.setOnClickListener {
            showTab(TAB_CHAPTERS)
        }

        // 默认显示设置
        showTab(TAB_SETTINGS)
    }

    /**
     * 显示标签页
     */
    private fun showTab(tab: Int) {
        binding.tabSettings.isSelected = tab == TAB_SETTINGS
        binding.tabBookmarks.isSelected = tab == TAB_BOOKMARKS
        binding.tabChapters.isSelected = tab == TAB_CHAPTERS

        binding.settingsPanel.visibility = if (tab == TAB_SETTINGS) View.VISIBLE else View.GONE
        binding.bookmarksPanel.visibility = if (tab == TAB_BOOKMARKS) View.VISIBLE else View.GONE
        binding.chaptersPanel.visibility = if (tab == TAB_CHAPTERS) View.VISIBLE else View.GONE

        when (tab) {
            TAB_BOOKMARKS -> loadBookmarks()
            TAB_CHAPTERS -> loadChapters()
        }
    }

    /**
     * 加载书签列表
     */
    private fun loadBookmarks() {
        bookmarksJob?.cancel()
        bookmarksJob = viewLifecycleOwner.lifecycleScope.launch {
            bookRepository.getBookmarks(bookId).collect { bookmarks ->
                binding.bookmarksList.removeAllViews()

                if (bookmarks.isEmpty()) {
                    val emptyView = TextView(requireContext()).apply {
                        text = "暂无书签"
                        setPadding(32, 32, 32, 32)
                        textSize = 18f
                    }
                    binding.bookmarksList.addView(emptyView)
                } else {
                    bookmarks.forEach { bookmark ->
                        val itemView = layoutInflater.inflate(
                            R.layout.item_bookmark,
                            binding.bookmarksList,
                            false
                        )

                        itemView.findViewById<TextView>(R.id.pageText)?.text = "第 ${bookmark.pageNumber} 页"
                        itemView.findViewById<TextView>(R.id.previewText)?.text = bookmark.previewText ?: ""

                        itemView.setOnClickListener {
                            menuListener?.onGoToPage(bookmark.pageNumber)
                            dismiss()
                        }

                        binding.bookmarksList.addView(itemView)
                    }
                }
            }
        }
    }

    /**
     * 加载章节列表
     */
    private fun loadChapters() {
        lifecycleScope.launch {
            val chapters = bookRepository.getChapters(bookId)
            binding.chaptersList.removeAllViews()

            chapters.forEach { chapter ->
                val itemView = layoutInflater.inflate(
                    R.layout.item_chapter,
                    binding.chaptersList,
                    false
                )

                itemView.findViewById<TextView>(R.id.chapterTitle)?.text =
                    "第${chapter.chapterIndex}回 ${chapter.title ?: ""}"

                // 标记当前章节
                if (currentPage >= chapter.startPage && currentPage <= chapter.endPage) {
                    itemView.setBackgroundColor(Color.parseColor("#33000000"))
                }

                itemView.setOnClickListener {
                    menuListener?.onGoToChapter(chapter.chapterIndex)
                    dismiss()
                }

                binding.chaptersList.addView(itemView)
            }
        }
    }

    /**
     * 设置监听器
     */
    fun setMenuListener(listener: MenuListener) {
        this.menuListener = listener
    }

    override fun onDestroyView() {
        bookmarksJob?.cancel()
        super.onDestroyView()
        _binding = null
    }

    companion object {
        const val ARG_BOOK_ID = "book_id"
        const val ARG_CURRENT_PAGE = "current_page"
        const val ARG_TOTAL_PAGES = "total_pages"

        const val TAB_SETTINGS = 0
        const val TAB_BOOKMARKS = 1
        const val TAB_CHAPTERS = 2

        fun newInstance(bookId: Long, currentPage: Int, totalPages: Int): ReaderMenuFragment {
            return ReaderMenuFragment().apply {
                arguments = Bundle().apply {
                    putLong(ARG_BOOK_ID, bookId)
                    putInt(ARG_CURRENT_PAGE, currentPage)
                    putInt(ARG_TOTAL_PAGES, totalPages)
                }
            }
        }
    }
}
