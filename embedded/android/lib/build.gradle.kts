/*
 * Copyright 2025 New Vector Ltd.
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
 * Please see LICENSE files in the repository root for full details.
 */

plugins {
    alias(libs.plugins.android.library)
    id("maven-publish")
}

repositories {
    mavenCentral()
    google()
}

android {
    namespace = "io.element.android"

    defaultConfig {
        compileSdk = 35
        minSdk = 24
    }

    publishing {
        singleVariant("release") {
            withSourcesJar()
        }
    }
}

afterEvaluate {
    publishing {
        publications {
            create<MavenPublication>("release") {
                from(components["release"])
                groupId = "io.element.android"
                artifactId = "element-call-embedded"
                version = System.getenv("EC_VERSION") ?: "0.16.4-entangle"

                pom {
                    name.set("Embedded Element Call for Android")
                    description.set("Android AAR package containing an embedded build of the Element Call widget.")
                    url.set("https://github.com/qbit-codes/element-call/")
                }
            }
        }
        repositories {
            maven {
                name = "GitHubPackages"
                url = uri("https://maven.pkg.github.com/qbit-codes/element-call")
                credentials {
                    username = System.getenv("GITHUB_ACTOR") ?: findProperty("gpr.user") as String? ?: ""
                    password = System.getenv("GITHUB_TOKEN") ?: findProperty("gpr.key") as String? ?: ""
                }
            }
        }
    }
}
