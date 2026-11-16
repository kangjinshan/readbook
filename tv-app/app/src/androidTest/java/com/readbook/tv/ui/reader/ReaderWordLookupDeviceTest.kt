package com.readbook.tv.ui.reader

import android.content.Intent
import android.content.Context
import android.media.AudioManager
import android.graphics.Bitmap
import android.os.SystemClock
import android.os.Looper
import android.text.Spanned
import android.text.style.BackgroundColorSpan
import android.view.InputDevice
import android.view.KeyEvent
import android.view.MotionEvent
import android.view.View
import android.webkit.WebView
import android.widget.LinearLayout
import android.widget.TextView
import androidx.test.core.app.ActivityScenario
import androidx.test.platform.app.InstrumentationRegistry
import com.readbook.tv.BuildConfig
import com.readbook.tv.R
import com.readbook.tv.ReadBookApp
import com.readbook.tv.data.model.Book
import com.readbook.tv.data.model.Chapter
import kotlinx.coroutines.runBlocking
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import java.io.File
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

class ReaderWordLookupDeviceTest {
    private val instrumentation = InstrumentationRegistry.getInstrumentation()
    private val app get() = instrumentation.targetContext.applicationContext as ReadBookApp
    private val text = "Harry apple river slow retry"

    private fun launch(html: Boolean, bookText: String = text, htmlMarkup: String? = null): ActivityScenario<ReaderActivity> {
        check(BuildConfig.DEFAULT_BASE_URL == "http://127.0.0.1:8896/") { "Use the isolated device fixture build" }
        val id = if (html) 90002L else 90001L
        runBlocking {
            app.database.bookDao().insertBook(Book(id, "Reader lookup QA", null, null, 1, 1, downloaded=true))
            app.database.chapterDao().insertChapters(listOf(Chapter(id, id, 0, "QA", 1, 1,
                content=bookText, renderMode=if(html) "webview" else null,
                renderBaseUrl=if(html) BuildConfig.DEFAULT_BASE_URL else null,
                renderHtml=if(html) htmlMarkup ?: "<p>Harry <em>apple</em> river slow retry</p>" else null,
                downloaded=true)))
        }
        val scenario = ActivityScenario.launch<ReaderActivity>(Intent(app, ReaderActivity::class.java)
            .putExtra(ReaderActivity.EXTRA_BOOK_ID, id).putExtra(ReaderActivity.EXTRA_TOTAL_PAGES, 1))
        waitFor(scenario) { it.findViewById<View>(R.id.loadingIndicator).visibility != View.VISIBLE }
        return scenario
    }

    private fun waitFor(scenario: ActivityScenario<ReaderActivity>, check: (ReaderActivity) -> Boolean) {
        val deadline=SystemClock.uptimeMillis()+12000
        while(SystemClock.uptimeMillis()<deadline) {
            var ready=false; scenario.onActivity { ready=check(it) }
            if(ready) return
            Thread.sleep(60)
        }
        fail("Reader UI did not reach expected state")
    }

    private fun mouse(scenario: ActivityScenario<ReaderActivity>, x: Float, y: Float, button: Int = MotionEvent.BUTTON_PRIMARY) {
        scenario.onActivity { activity ->
            val down=SystemClock.uptimeMillis()
            for(action in listOf(MotionEvent.ACTION_DOWN,MotionEvent.ACTION_BUTTON_PRESS,MotionEvent.ACTION_BUTTON_RELEASE,MotionEvent.ACTION_UP)) {
                val props=MotionEvent.PointerProperties().apply { id=0;toolType=MotionEvent.TOOL_TYPE_MOUSE }
                val coords=MotionEvent.PointerCoords().apply { this.x=x;this.y=y;pressure=1f;size=1f }
                val event=MotionEvent.obtain(down,SystemClock.uptimeMillis(),action,1,arrayOf(props),arrayOf(coords),
                    0,if(action==MotionEvent.ACTION_DOWN || action==MotionEvent.ACTION_BUTTON_PRESS) button else 0,1f,1f,0,0,InputDevice.SOURCE_MOUSE,0)
                if(action==MotionEvent.ACTION_BUTTON_PRESS || action==MotionEvent.ACTION_BUTTON_RELEASE) {
                    event.javaClass.getDeclaredMethod("setActionButton", Integer.TYPE).invoke(event, button)
                    activity.dispatchGenericMotionEvent(event)
                } else activity.dispatchTouchEvent(event)
                event.recycle()
            }
        }
    }

    private fun nativeClick(scenario: ActivityScenario<ReaderActivity>, word: String, button: Int = MotionEvent.BUTTON_PRIMARY) {
        var x=0f;var y=0f
        scenario.onActivity { activity ->
            val stack=activity.findViewById<LinearLayout>(R.id.pageContentStack)
            val view=(0 until stack.childCount).map { stack.getChildAt(it) }.filterIsInstance<TextView>().first { it.text.contains(word) }
            val start=view.text.indexOf(word); val line=view.layout.getLineForOffset(start)
            val location=IntArray(2);view.getLocationOnScreen(location)
            x=location[0]+view.totalPaddingLeft+(view.layout.getPrimaryHorizontal(start)+view.layout.getPrimaryHorizontal(start+word.length))/2
            y=location[1]+view.totalPaddingTop+(view.layout.getLineTop(line)+view.layout.getLineBottom(line))/2f
        }
        mouse(scenario,x,y,button)
    }

    private fun key(scenario: ActivityScenario<ReaderActivity>, code: Int) {
        scenario.onActivity { it.dispatchKeyEvent(KeyEvent(KeyEvent.ACTION_DOWN,code));it.dispatchKeyEvent(KeyEvent(KeyEvent.ACTION_UP,code)) }
    }

    private fun screenshot(name: String) {
        instrumentation.waitForIdleSync()
        Thread.sleep(250)
        File(app.getExternalFilesDir(null),"$name.png").outputStream().use {
            instrumentation.uiAutomation.takeScreenshot().compress(Bitmap.CompressFormat.PNG,100,it)
        }
    }

    @Test fun actualTreehouseTextMouseLookup() {
        val fixture=File(app.filesDir,"qa-treehouse.json")
        org.junit.Assume.assumeTrue("Optional private book fixture", fixture.isFile)
        val bookText=JSONObject(fixture.readText()).getString("content")
        launch(false,bookText).use { scenario ->
            waitFor(scenario) {
                val stack=it.findViewById<LinearLayout>(R.id.pageContentStack)
                (0 until stack.childCount).any { index -> (stack.getChildAt(index) as? TextView)?.text?.contains("monster") == true }
            }
            nativeClick(scenario,"monster")
            waitFor(scenario) { it.findViewById<TextView>(R.id.lookupMeaning).text.contains("怪物") }
            screenshot("treehouse-monster")
            // Clicking blank page dismisses the card without leaving the reader.
            var bottom=0f
            scenario.onActivity { bottom=it.window.decorView.height-1f }
            mouse(scenario,1f,bottom)
            scenario.onActivity { assertEquals(View.GONE,it.findViewById<View>(R.id.wordLookupPanel).visibility);assertFalse(it.isFinishing) }
            nativeClick(scenario,"Annie")
            waitFor(scenario) { it.findViewById<TextView>(R.id.lookupMeaning).text.contains("人物姓名") }
            screenshot("treehouse-annie")
        }
    }

    @Test fun nativeMouseLeftClickNameDpadAndBack() {
        launch(false).use { scenario ->
            waitFor(scenario) { it.findViewById<LinearLayout>(R.id.pageContentStack).childCount>0 }
            nativeClick(scenario,"apple",MotionEvent.BUTTON_SECONDARY)
            scenario.onActivity { assertEquals(View.GONE,it.findViewById<View>(R.id.wordLookupPanel).visibility) }
            nativeClick(scenario,"apple")
            waitFor(scenario) { it.findViewById<TextView>(R.id.lookupMeaning).text.toString()=="苹果" }
            screenshot("reader-native-word")
            key(scenario,KeyEvent.KEYCODE_BACK)
            scenario.onActivity { assertFalse(it.isFinishing);assertEquals(View.GONE,it.findViewById<View>(R.id.wordLookupPanel).visibility) }
            nativeClick(scenario,"Harry")
            waitFor(scenario) { it.findViewById<TextView>(R.id.lookupMeaning).text.contains("人物姓名") }
            key(scenario,KeyEvent.KEYCODE_BACK)
            key(scenario,KeyEvent.KEYCODE_DPAD_CENTER)
            key(scenario,KeyEvent.KEYCODE_DPAD_RIGHT)
            key(scenario,KeyEvent.KEYCODE_DPAD_CENTER)
            waitFor(scenario) { it.findViewById<View>(R.id.wordLookupPanel).visibility==View.VISIBLE }
            key(scenario,KeyEvent.KEYCODE_BACK)
            key(scenario,KeyEvent.KEYCODE_BACK)
            scenario.onActivity { assertFalse(it.isFinishing) }
        }
    }

    @Test fun retryAndLateResponseCannotReplaceNewWord() {
        launch(false).use { scenario ->
            waitFor(scenario) { it.findViewById<LinearLayout>(R.id.pageContentStack).childCount>0 }
            nativeClick(scenario,"retry")
            waitFor(scenario) { it.findViewById<TextView>(R.id.lookupMeaning).text.contains("重试") }
            key(scenario,KeyEvent.KEYCODE_DPAD_CENTER)
            waitFor(scenario) { it.findViewById<TextView>(R.id.lookupMeaning).text.toString()=="重试" }
            key(scenario,KeyEvent.KEYCODE_BACK)
            nativeClick(scenario,"slow")
            nativeClick(scenario,"apple")
            waitFor(scenario) { it.findViewById<TextView>(R.id.lookupMeaning).text.toString()=="苹果" }
            Thread.sleep(1000)
            scenario.onActivity { assertEquals("apple",it.findViewById<TextView>(R.id.lookupWord).text.toString()) }
        }
    }

    private fun js(scenario: ActivityScenario<ReaderActivity>, script: String): String {
        val latch=CountDownLatch(1);var result="null"
        scenario.onActivity { it.findViewById<WebView>(R.id.chapterWebView).evaluateJavascript(script) { value -> result=value;latch.countDown() } }
        assertTrue(latch.await(5,TimeUnit.SECONDS));return result
    }

    private fun nativeSelectedWord(scenario: ActivityScenario<ReaderActivity>): String {
        var selected = ""
        scenario.onActivity { activity ->
            val stack = activity.findViewById<LinearLayout>(R.id.pageContentStack)
            for (index in 0 until stack.childCount) {
                val text = (stack.getChildAt(index) as? TextView)?.text as? Spanned ?: continue
                val span = text.getSpans(0,text.length,BackgroundColorSpan::class.java).firstOrNull() ?: continue
                selected = text.subSequence(text.getSpanStart(span),text.getSpanEnd(span)).toString()
            }
        }
        return selected
    }

    @Test fun nativeUpDownMovesOneLineAndPreservesColumnThroughShortLine() {
        launch(false,"alpha beta gamma\n\nshort\n\nalpha beta gamma").use { scenario ->
            waitFor(scenario) { it.findViewById<LinearLayout>(R.id.pageContentStack).childCount > 0 }
            key(scenario,KeyEvent.KEYCODE_DPAD_CENTER)
            key(scenario,KeyEvent.KEYCODE_DPAD_RIGHT); key(scenario,KeyEvent.KEYCODE_DPAD_RIGHT)
            assertEquals("gamma",nativeSelectedWord(scenario))
            key(scenario,KeyEvent.KEYCODE_DPAD_DOWN); assertEquals("short",nativeSelectedWord(scenario))
            key(scenario,KeyEvent.KEYCODE_DPAD_DOWN); assertEquals("gamma",nativeSelectedWord(scenario))
            key(scenario,KeyEvent.KEYCODE_DPAD_DOWN); assertEquals("gamma",nativeSelectedWord(scenario))
            key(scenario,KeyEvent.KEYCODE_DPAD_UP); assertEquals("short",nativeSelectedWord(scenario))
            key(scenario,KeyEvent.KEYCODE_DPAD_UP); assertEquals("gamma",nativeSelectedWord(scenario))
        }
    }

    @Test fun htmlUpDownMovesOneLineWithoutJumpingToOtherColumn() {
        launch(true,htmlMarkup="<p>alpha beta gamma<br>short<br>alpha beta gamma</p><p style='break-before:column'>other column words<br>different right row</p>").use { scenario ->
            val deadline=SystemClock.uptimeMillis()+12000
            while(js(scenario,"!!document.querySelector('.readbook-word')")!="true" && SystemClock.uptimeMillis()<deadline) Thread.sleep(60)
            fun selected() = js(scenario,"Array.from(document.querySelectorAll('.readbook-word')).find(n=>n.style.backgroundColor)?.textContent")
            key(scenario,KeyEvent.KEYCODE_DPAD_CENTER)
            key(scenario,KeyEvent.KEYCODE_DPAD_RIGHT); key(scenario,KeyEvent.KEYCODE_DPAD_RIGHT)
            assertEquals("\"gamma\"",selected())
            key(scenario,KeyEvent.KEYCODE_DPAD_DOWN); assertEquals("\"short\"",selected())
            key(scenario,KeyEvent.KEYCODE_DPAD_DOWN); assertEquals("\"gamma\"",selected())
            key(scenario,KeyEvent.KEYCODE_DPAD_DOWN); assertEquals("\"gamma\"",selected())
            key(scenario,KeyEvent.KEYCODE_DPAD_UP); assertEquals("\"short\"",selected())
            key(scenario,KeyEvent.KEYCODE_DPAD_UP); assertEquals("\"gamma\"",selected())
        }
    }

    @Test fun everyPopupArrowDismissesAndMovesTheCursorWithoutTurningThePage() {
        launch(false,"alpha beta gamma\n\nleft middle right").use { scenario ->
            waitFor(scenario) { it.findViewById<LinearLayout>(R.id.pageContentStack).childCount > 0 }
            val cases=listOf(KeyEvent.KEYCODE_DPAD_LEFT to "alpha",KeyEvent.KEYCODE_DPAD_RIGHT to "gamma",
                KeyEvent.KEYCODE_DPAD_UP to "beta",KeyEvent.KEYCODE_DPAD_DOWN to "middle")
            for ((code,word) in cases) {
                nativeClick(scenario,"beta")
                scenario.onActivity { assertEquals(View.VISIBLE,it.findViewById<View>(R.id.wordLookupPanel).visibility) }
                key(scenario,code)
                scenario.onActivity { assertEquals(View.GONE,it.findViewById<View>(R.id.wordLookupPanel).visibility) }
                assertEquals(word,nativeSelectedWord(scenario))
            }
        }
    }

    @Test fun htmlPopupArrowDismissesAndMovesToNextLine() {
        launch(true,htmlMarkup="<p>alpha beta gamma<br>left middle right</p>").use { scenario ->
            val deadline=SystemClock.uptimeMillis()+12000
            while(js(scenario,"!!document.querySelector('.readbook-word')")!="true" && SystemClock.uptimeMillis()<deadline) Thread.sleep(60)
            key(scenario,KeyEvent.KEYCODE_DPAD_CENTER);key(scenario,KeyEvent.KEYCODE_DPAD_RIGHT)
            js(scenario,"true")
            key(scenario,KeyEvent.KEYCODE_DPAD_CENTER)
            waitFor(scenario) { it.findViewById<View>(R.id.wordLookupPanel).visibility==View.VISIBLE }
            key(scenario,KeyEvent.KEYCODE_DPAD_DOWN)
            assertEquals("\"middle\"",js(scenario,"Array.from(document.querySelectorAll('.readbook-word')).find(n=>n.style.backgroundColor)?.textContent"))
            scenario.onActivity { assertEquals(View.GONE,it.findViewById<View>(R.id.wordLookupPanel).visibility) }
        }
    }

    @Test fun pronunciationStartsAndArrowDismissalCancelsLateAudio() {
        org.junit.Assume.assumeTrue(InstrumentationRegistry.getArguments().getString("audio")=="true")
        val audio=app.getSystemService(Context.AUDIO_SERVICE) as AudioManager
        launch(false).use { scenario ->
            waitFor(scenario) { it.findViewById<LinearLayout>(R.id.pageContentStack).childCount > 0 }
            nativeClick(scenario,"apple")
            waitFor(scenario) { audio.isMusicActive }
            nativeClick(scenario,"river")
            waitFor(scenario) { it.findViewById<TextView>(R.id.lookupMeaning).text.toString()=="河流" }
            Thread.sleep(100)
            assertFalse("Previous pronunciation must stop on a new word",audio.isMusicActive)
            key(scenario,KeyEvent.KEYCODE_DPAD_RIGHT)
            assertEquals("slow",nativeSelectedWord(scenario))
            Thread.sleep(1200)
            assertFalse("Late audio must not play after the popup closes",audio.isMusicActive)
        }
    }

    @Test fun slowAudioReleaseNeverBlocksPopupDismissalOrCursorMovement() {
        org.junit.Assume.assumeTrue(InstrumentationRegistry.getArguments().getString("audio")=="true")
        val releaseStarted=CountDownLatch(1)
        val allowRelease=CountDownLatch(1)
        val audio=app.getSystemService(Context.AUDIO_SERVICE) as AudioManager
        launch(false).use { scenario ->
            try {
                scenario.onActivity { activity ->
                    val player=ReaderWordAudioPlayer(activity, releasePlayer={ media ->
                        assertNotEquals(Looper.getMainLooper(),Looper.myLooper())
                        releaseStarted.countDown()
                        allowRelease.await(5,TimeUnit.SECONDS)
                        media.release()
                    }, onError={})
                    ReaderActivity::class.java.getDeclaredField("wordAudioPlayer").apply { isAccessible=true }.set(activity,player)
                }
                waitFor(scenario) { it.findViewById<LinearLayout>(R.id.pageContentStack).childCount>0 }
                nativeClick(scenario,"apple")
                waitFor(scenario) { audio.isMusicActive }
                val start=SystemClock.uptimeMillis()
                key(scenario,KeyEvent.KEYCODE_DPAD_RIGHT)
                assertTrue("UI must not wait for native audio release",SystemClock.uptimeMillis()-start<300)
                assertTrue(releaseStarted.await(2,TimeUnit.SECONDS))
                waitFor(scenario) { !audio.isMusicActive }
                scenario.onActivity { assertEquals(View.GONE,it.findViewById<View>(R.id.wordLookupPanel).visibility) }
                assertEquals("river",nativeSelectedWord(scenario))
                // The old release remains deliberately blocked while the UI handles another key.
                key(scenario,KeyEvent.KEYCODE_DPAD_LEFT)
                assertEquals("apple",nativeSelectedWord(scenario))
                key(scenario,KeyEvent.KEYCODE_DPAD_RIGHT)
                key(scenario,KeyEvent.KEYCODE_DPAD_CENTER)
                waitFor(scenario) { audio.isMusicActive }
                allowRelease.countDown()
                Thread.sleep(100)
                assertTrue("Old focus cleanup must not stop the next pronunciation",audio.isMusicActive)
            } finally { allowRelease.countDown() }
        }
    }

    @Test fun completedPronunciationsCanBeSwitchedRepeatedlyWithoutBlockingTheUi() {
        org.junit.Assume.assumeTrue(InstrumentationRegistry.getArguments().getString("audio")=="true")
        val audio=app.getSystemService(Context.AUDIO_SERVICE) as AudioManager
        launch(false).use { scenario ->
            waitFor(scenario) { it.findViewById<LinearLayout>(R.id.pageContentStack).childCount>0 }
            for (word in listOf("apple","river","apple","river")) {
                nativeClick(scenario,word)
                waitFor(scenario) { audio.isMusicActive }
                waitFor(scenario) { !audio.isMusicActive }
                Thread.sleep(300)
                val start=SystemClock.uptimeMillis()
                key(scenario,KeyEvent.KEYCODE_DPAD_UP)
                assertTrue(SystemClock.uptimeMillis()-start<300)
                scenario.onActivity { assertEquals(View.GONE,it.findViewById<View>(R.id.wordLookupPanel).visibility) }
            }
        }
    }

    @Test fun htmlInlineWordMouseAndDpad() {
        launch(true).use { scenario ->
            val deadline=SystemClock.uptimeMillis()+12000
            while(js(scenario,"!!document.querySelector('.readbook-word')")!="true" && SystemClock.uptimeMillis()<deadline) Thread.sleep(60)
            val coords=JSONObject(js(scenario,"""(function(){var n=Array.from(document.querySelectorAll('.readbook-word')).find(n=>n.textContent==='apple');var r=n.getBoundingClientRect();return {x:(r.left+r.right)/2,y:(r.top+r.bottom)/2,dpr:devicePixelRatio};})()"""))
            var left=0;var top=0
            scenario.onActivity { val loc=IntArray(2);it.findViewById<WebView>(R.id.chapterWebView).getLocationOnScreen(loc);left=loc[0];top=loc[1] }
            mouse(scenario,left+coords.getDouble("x").toFloat()*coords.getDouble("dpr").toFloat(),top+coords.getDouble("y").toFloat()*coords.getDouble("dpr").toFloat())
            Thread.sleep(500)
            screenshot("reader-html-word-before-wait")
            waitFor(scenario) { it.findViewById<TextView>(R.id.lookupMeaning).text.toString()=="苹果" }
            screenshot("reader-html-word")
            key(scenario,KeyEvent.KEYCODE_BACK)
            key(scenario,KeyEvent.KEYCODE_DPAD_CENTER)
            Thread.sleep(100)
            key(scenario,KeyEvent.KEYCODE_DPAD_CENTER)
            waitFor(scenario) { it.findViewById<View>(R.id.wordLookupPanel).visibility==View.VISIBLE }
        }
    }
}
