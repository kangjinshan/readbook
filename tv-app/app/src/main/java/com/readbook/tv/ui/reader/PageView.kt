package com.readbook.tv.ui.reader

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.util.AttributeSet
import android.view.View

/**
 * 页面视图
 * 自定义 View 用于渲染单页内容
 * 支持分页计算和渲染
 */
class PageView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyleAttr: Int = 0
) : View(context, attrs, defStyleAttr) {

    // 绘制相关
    private val textPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val titlePaint = Paint(Paint.ANTI_ALIAS_FLAG)

    // 内容
    private var content: String = ""
    private var chapterTitle: String? = null

    // 配置
    var fontSize: Float = 42f
        set(value) {
            field = value
            textPaint.textSize = value * resources.displayMetrics.density
            invalidate()
        }

    var textColor: Int = Color.parseColor("#2A2A2A")
        set(value) {
            field = value
            textPaint.color = value
            invalidate()
        }

    var bgColor: Int = Color.parseColor("#FFF8DC")
        set(value) {
            field = value
            invalidate()
        }

    var lineHeight: Float = 1.8f
    var paragraphSpacing: Float = 2.0f

    // 布局参数
    private var contentWidth: Float = 0f
    private var contentHeight: Float = 0f
    private var contentLeft: Float = 0f
    private var contentTop: Float = 0f

    // 分页后的行
    private var lines: List<String> = emptyList()

    init {
        // 初始化画笔
        textPaint.apply {
            textSize = fontSize * resources.displayMetrics.density
            color = textColor
            textAlign = Paint.Align.LEFT
        }

        titlePaint.apply {
            textSize = fontSize * resources.displayMetrics.density * 1.2f
            color = textColor
            textAlign = Paint.Align.CENTER
            isFakeBoldText = true
        }
    }

    override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
        super.onSizeChanged(w, h, oldw, oldh)

        // 计算内容区域（留白 12% 左右，10% 上下）
        contentWidth = w * 0.76f
        contentHeight = h * 0.80f
        contentLeft = w * 0.12f
        contentTop = h * 0.10f

        // 重新计算布局
        calculateLayout()
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)

        // 绘制背景
        canvas.drawColor(bgColor)

        // 绘制内容
        val lineSpacing = fontSize * resources.displayMetrics.density * lineHeight
        var y = contentTop + fontSize * resources.displayMetrics.density

        // 绘制章节标题（如果有）
        chapterTitle?.let { title ->
            if (lines.isEmpty() || lines.first().contains(title)) {
                val titleY = y
                canvas.drawText(
                    title,
                    width / 2f,
                    titleY,
                    titlePaint
                )
                y += lineSpacing * 1.5f
            }
        }

        // 绘制正文
        lines.forEach { line ->
            canvas.drawText(line, contentLeft, y, textPaint)
            y += lineSpacing
        }
    }

    /**
     * 设置内容
     */
    fun setContent(content: String, chapterTitle: String? = null) {
        this.content = content
        this.chapterTitle = chapterTitle
        calculateLayout()
        invalidate()
    }

    /**
     * 计算布局
     */
    private fun calculateLayout() {
        if (contentWidth <= 0 || content.isEmpty()) {
            lines = emptyList()
            return
        }

        lines = splitIntoLines(content, contentWidth)
    }

    /**
     * 将文本分割成行
     */
    private fun splitIntoLines(text: String, maxWidth: Float): List<String> {
        val result = mutableListOf<String>()

        // 按段落分割
        val paragraphs = text.split("\n\n")

        paragraphs.forEachIndexed { index, paragraph ->
            if (paragraph.isBlank()) return@forEachIndexed

            var remaining = paragraph

            while (remaining.isNotEmpty()) {
                val chars = paintBreakText(textPaint, remaining, maxWidth)

                if (chars <= 0) break

                val line = remaining.substring(0, chars)
                result.add(line)
                remaining = remaining.substring(chars)
            }

            // 添加段落间的空行（除了最后一段）
            if (index < paragraphs.size - 1) {
                result.add("")
            }
        }

        return result
    }

    /**
     * 计算一行能容纳的字符数
     */
    private fun paintBreakText(paint: Paint, text: String, maxWidth: Float): Int {
        return paint.breakText(text, true, maxWidth, null)
    }

    /**
     * 测量所需高度
     */
    fun measureHeight(): Float {
        val lineSpacing = fontSize * resources.displayMetrics.density * lineHeight
        return contentTop + lines.size * lineSpacing
    }
}
