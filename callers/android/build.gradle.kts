plugins {
    kotlin("jvm") version "1.9.20"
    application
}

group = "com.socks5"
version = "1.0-SNAPSHOT"

repositories {
    mavenCentral()
}

dependencies {
    // Стандартная библиотека Kotlin достаточна
}

kotlin {
    jvmToolchain(11)
}

application {
    mainClass.set("Socks5ServerKt")
}

