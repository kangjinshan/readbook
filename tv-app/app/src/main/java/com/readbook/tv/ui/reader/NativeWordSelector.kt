package com.readbook.tv.ui.reader

import android.annotation.SuppressLint
import android.graphics.Color
import android.graphics.Rect
import android.text.SpannableString
import android.text.Spanned
import android.text.style.BackgroundColorSpan
import android.view.InputDevice
import android.view.MotionEvent
import android.view.ViewConfiguration
import android.widget.TextView
import kotlin.math.abs

class NativeWordSelector(private val onSelected: (ReaderWordSelection) -> Unit) {
    private data class Token(val view: TextView, val range: IntRange, val text: String)
    private val tokens = mutableListOf<Token>()
    private var selected = -1
    private var selectedLine: Int? = null
    private var preferredX: Float? = null

    fun clear() {
        clearHighlight()
        tokens.clear()
    }

    fun clearHighlight() {
        tokens.getOrNull(selected)?.let { it.view.text = it.text }
        selected = -1
        selectedLine = null
        preferredX = null
    }

    @SuppressLint("ClickableViewAccessibility")
    fun bind(view: TextView, text: String) {
        val first = tokens.size
        val ranges = ReaderWords.ranges(text)
        tokens += ranges.map { Token(view, it, text) }
        val slop = ViewConfiguration.get(view.context).scaledTouchSlop
        var downIndex = -1
        var downX = 0f
        var downY = 0f
        view.setOnTouchListener { _, event ->
            fun hit(): Int {
                val layout = view.layout ?: return -1
                val x = event.x - view.totalPaddingLeft + view.scrollX
                val y = event.y - view.totalPaddingTop + view.scrollY
                if (y < 0 || y >= layout.height) return -1
                val line = layout.getLineForVertical(y.toInt())
                if (x < layout.getLineLeft(line) || x >= layout.getLineRight(line)) return -1
                val offset = layout.getOffsetForHorizontal(line, x)
                val index = ranges.indexOfFirst { range ->
                    val start = maxOf(range.first, layout.getLineStart(line))
                    val end = minOf(range.last + 1, layout.getLineEnd(line))
                    val right = if (layout.getLineForOffset(end) != line) layout.getLineRight(line) else layout.getPrimaryHorizontal(end)
                    start < end && offset in start..end &&
                        x >= layout.getPrimaryHorizontal(start) && x < right
                }
                return if (index < 0) -1 else first + index
            }
            when (event.actionMasked) {
                MotionEvent.ACTION_DOWN -> {
                    if (event.isFromSource(InputDevice.SOURCE_MOUSE) &&
                        event.buttonState and MotionEvent.BUTTON_PRIMARY == 0) return@setOnTouchListener false
                    downIndex = hit(); downX = event.x; downY = event.y
                    downIndex >= 0
                }
                MotionEvent.ACTION_UP -> {
                    val candidate = downIndex
                    downIndex = -1
                    if (candidate >= 0 && hit() == candidate && abs(event.x - downX) < slop && abs(event.y - downY) < slop) {
                        highlight(candidate)
                        view.performClick()
                        confirm()
                        true
                    } else false
                }
                MotionEvent.ACTION_CANCEL -> { downIndex = -1; false }
                else -> downIndex >= 0
            }
        }
    }

    fun move(delta: Int, vertical: Boolean = false): Boolean {
        if (tokens.isEmpty()) return false
        if (vertical && selected >= 0) {
            val boxes = wordBoxes()
            val current = boxes.firstOrNull { it.token == selected && it.line == selectedLine }
                ?: boxes.firstOrNull { it.token == selected } ?: return true
            val x = preferredX ?: current.centerX
            ReaderWordNavigation.verticalTarget(boxes, current, delta, x)?.let { target ->
                highlight(target.token, target.line, x)
            }
        } else {
            highlight(if (selected < 0) 0 else (selected + delta).coerceIn(tokens.indices))
        }
        return true
    }

    private fun wordBoxes(): List<ReaderWordBox> {
        val boxes = mutableListOf<ReaderWordBox>()
        val origins = mutableMapOf<TextView, Pair<Int, IntArray>>()
        var nextLine = 0
        tokens.forEachIndexed { index, token ->
            val layout = token.view.layout ?: return@forEachIndexed
            val origin = origins.getOrPut(token.view) {
                val location = IntArray(2).also { token.view.getLocationOnScreen(it) }
                val base = nextLine; nextLine += layout.lineCount
                base to location
            }
            for (line in layout.getLineForOffset(token.range.first)..layout.getLineForOffset(token.range.last)) {
                val start = maxOf(token.range.first, layout.getLineStart(line))
                val end = minOf(token.range.last + 1, layout.getLineEnd(line))
                val left = layout.getPrimaryHorizontal(start)
                val right = if (layout.getLineForOffset(end) != line) layout.getLineRight(line) else layout.getPrimaryHorizontal(end)
                boxes += ReaderWordBox(index, origin.first + line,
                    origin.second[0] + token.view.totalPaddingLeft + left,
                    origin.second[0] + token.view.totalPaddingLeft + right,
                    (origin.second[1] + token.view.totalPaddingTop + layout.getLineTop(line)).toFloat(),
                    (origin.second[1] + token.view.totalPaddingTop + layout.getLineBottom(line)).toFloat())
            }
        }
        return boxes
    }

    private fun highlight(index: Int, line: Int? = null, anchorX: Float? = null) {
        tokens.getOrNull(selected)?.let { it.view.text = it.text }
        selected = index
        val box = wordBoxes().firstOrNull { it.token == index && (line == null || line == it.line) }
        selectedLine = box?.line
        preferredX = anchorX ?: box?.centerX
        val token = tokens[index]
        token.view.text = SpannableString(token.text).apply {
            setSpan(BackgroundColorSpan(Color.argb(160, 186, 201, 155)), token.range.first,
                token.range.last + 1, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
        }
        token.view.layout?.let { layout ->
            val line = layout.getLineForOffset(token.range.first)
            val location = IntArray(2).also { token.view.getLocationOnScreen(it) }
            val top = box?.let { (it.top - location[1]).toInt() } ?: layout.getLineTop(line)
            val bottom = box?.let { (it.bottom - location[1]).toInt() } ?: layout.getLineBottom(line)
            token.view.requestRectangleOnScreen(Rect(0, top, token.view.width, bottom), true)
        }
    }

    fun confirm() {
        tokens.getOrNull(selected)?.let { onSelected(ReaderWords.selection(it.text, it.range)) }
    }
}
