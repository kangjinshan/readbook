package com.readbook.tv.data.local

import android.database.sqlite.SQLiteDatabase
import androidx.room.Room
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.*
import org.junit.Test

class LegacyDatabaseMigrationTest {
    @Test fun upgradesMissingIndexesFromEveryOldVersionWithoutLosingRows() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        for (version in 1..3) {
            val name = "legacy-migration-qa-$version.db"
            context.deleteDatabase(name)
            val file = context.getDatabasePath(name)
            file.parentFile!!.mkdirs()
            SQLiteDatabase.openOrCreateDatabase(file, null).use { db ->
                db.execSQL("CREATE TABLE books(id INTEGER NOT NULL PRIMARY KEY,title TEXT NOT NULL,author TEXT,coverUrl TEXT,totalPages INTEGER NOT NULL,totalChapters INTEGER,format TEXT NOT NULL,downloaded INTEGER NOT NULL,downloadedAt INTEGER,updatedAt INTEGER NOT NULL)")
                val extra = (if (version >= 2) ",contentBlocksJson TEXT" else "") +
                    (if (version >= 3) ",renderMode TEXT,renderBaseUrl TEXT,renderHtml TEXT,renderCssJson TEXT" else "")
                db.execSQL("CREATE TABLE chapters(id INTEGER NOT NULL PRIMARY KEY,bookId INTEGER NOT NULL,chapterIndex INTEGER NOT NULL,title TEXT,startPage INTEGER NOT NULL,endPage INTEGER NOT NULL,content TEXT,downloaded INTEGER NOT NULL$extra,FOREIGN KEY(bookId) REFERENCES books(id) ON DELETE CASCADE)")
                db.execSQL("CREATE TABLE bookmarks(id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,bookId INTEGER NOT NULL,pageNumber INTEGER NOT NULL,chapterIndex INTEGER,previewText TEXT,createdAt INTEGER NOT NULL,serverId INTEGER,syncStatus TEXT NOT NULL,FOREIGN KEY(bookId) REFERENCES books(id) ON DELETE CASCADE)")
                db.execSQL("CREATE TABLE reading_progress(id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,bookId INTEGER NOT NULL,currentPage INTEGER NOT NULL,currentChapter INTEGER NOT NULL,totalTimeSeconds INTEGER NOT NULL,lastReadAt INTEGER NOT NULL,syncStatus TEXT NOT NULL,updatedAt INTEGER NOT NULL,FOREIGN KEY(bookId) REFERENCES books(id) ON DELETE CASCADE)")
                db.execSQL("INSERT INTO books VALUES(1,'Saved Book',NULL,NULL,20,1,'EPUB',1,NULL,123)")
                db.execSQL("INSERT INTO chapters(id,bookId,chapterIndex,title,startPage,endPage,content,downloaded) VALUES(1,1,1,'Saved Chapter',1,20,'Saved text',1)")
                db.execSQL("INSERT INTO bookmarks VALUES(1,1,7,1,'Saved bookmark',123,88,'PENDING')")
                db.execSQL("INSERT INTO reading_progress VALUES(1,1,7,1,456,123,'PENDING',123)")
                db.version = version
            }
            val room = Room.databaseBuilder(context, AppDatabase::class.java, name)
                .addMigrations(MIGRATION_1_2, MIGRATION_2_3, MIGRATION_3_4).build()
            try {
                val db = room.openHelper.writableDatabase // Room validates every table and index here.
                db.query("SELECT currentPage,totalTimeSeconds,syncStatus FROM reading_progress").use {
                    assertTrue(it.moveToFirst()); assertEquals(7,it.getInt(0)); assertEquals(456,it.getInt(1)); assertEquals("PENDING",it.getString(2))
                }
                db.query("SELECT content FROM chapters").use { assertTrue(it.moveToFirst()); assertEquals("Saved text",it.getString(0)) }
                db.query("SELECT pageNumber,serverId FROM bookmarks").use { assertTrue(it.moveToFirst()); assertEquals(7,it.getInt(0)); assertEquals(88,it.getInt(1)) }
                assertEquals(4,db.version)
            } finally { room.close(); context.deleteDatabase(name) }
        }
    }
}
