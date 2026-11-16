package com.readbook.tv.ui.reader

import android.content.Context
import android.util.AttributeSet
import android.view.View.MeasureSpec
import android.widget.ScrollView

/** Short definitions stay compact; long definitions remain readable with remote scrolling. */
class ReaderDefinitionScrollView @JvmOverloads constructor(context: Context, attrs: AttributeSet? = null) : ScrollView(context, attrs) {
    override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
        val maximum = (180 * resources.displayMetrics.density).toInt()
        val limit = if (MeasureSpec.getMode(heightMeasureSpec) == MeasureSpec.UNSPECIFIED) maximum
            else minOf(maximum, MeasureSpec.getSize(heightMeasureSpec))
        super.onMeasure(widthMeasureSpec, MeasureSpec.makeMeasureSpec(limit, MeasureSpec.AT_MOST))
    }
}
